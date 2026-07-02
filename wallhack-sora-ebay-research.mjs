import fs from 'fs';
import { chromium } from 'playwright';

const RETAIL_PRICE = 129;
const PROXY_FILE = './proxies-mobilemix.txt';

const QUERIES = [
  'Wallhack Carnage Sora mousepad',
  'Wallhack Drift Sora mousepad',
  'Wallhack Sora mousepad glass',
  'Wallhack SP-005'
];

function getRandomProxy() {
  const lines = fs.readFileSync(PROXY_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const randomLine = lines[Math.floor(Math.random() * lines.length)];
  const parts = randomLine.trim().split(':');
  if (parts.length < 2) return null;

  const host = parts[0];
  const port = parts[1];
  const user = parts[2] || '';
  const pass = parts[3] || '';

  let proxy = `http://${host}:${port}`;
  if (user && pass) {
    proxy = `http://${user}:${pass}@${host}:${port}`;
  }
  return proxy;
}

async function scrapeEbayQuery(query, isSold = true) {
  const params = new URLSearchParams();
  params.append('_nkw', query);
  if (isSold) {
    params.append('LH_Complete', '1');
    params.append('LH_Sold', '1');
  }
  params.append('_sop', '13'); // sort by newest first

  const url = `https://www.ebay.com/sch/i.html?${params.toString()}`;
  console.log(`\n[${isSold ? 'SOLD' : 'ACTIVE'}] Scraping: "${query}"`);
  console.log(`URL: ${url}`);

  let browser;

  try {
    // Try to connect to Chrome's CDP endpoint first (localhost:9222)
    try {
      browser = await chromium.connectOverCDP('http://localhost:9222');
      console.log(`  Connected to CDP localhost:9222`);
    } catch {
      // Fall back to launching a new browser without proxy (direct access)
      console.log(`  Launching new browser (direct access)`);
      browser = await chromium.launch({ headless: true });
    }

    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    });

    // Set a longer timeout
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);

    await page.goto(url, { waitUntil: 'networkidle' });

    // eBay 2026 DOM: li.s-card or li.s-item; wait for results to render
    await page.waitForSelector('li.s-card, li.s-item', { timeout: 12000 }).catch(() => null);

    // Give JS time to render prices
    await page.waitForTimeout(2000);

    // Extract listings
    const listings = await page.evaluate(() => {
      const items = document.querySelectorAll('li.s-card, li.s-item');
      const results = [];

      items.forEach(item => {
        // Title: try [class*="title"] first, then h3, then first a
        let titleEl = item.querySelector('[class*="title"]');
        if (!titleEl) titleEl = item.querySelector('h3');
        if (!titleEl) titleEl = item.querySelector('a');

        const title = titleEl?.textContent?.trim() || '';

        // Skip junk
        if (title.includes('Shop on eBay') || title.includes('View similar')) {
          return;
        }

        // Price: [class*="s-card__price"] or [class*="price"] or .s-item__price
        let priceEl = item.querySelector('[class*="s-card__price"]');
        if (!priceEl) priceEl = item.querySelector('[class*="price"]');
        if (!priceEl) priceEl = item.querySelector('.s-item__price');

        let priceText = priceEl?.textContent?.trim() || '';

        // Parse price (handle $X.XX, $X,XXX.XX variants)
        const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;

        if (title && price && price > 0 && price < 50000) {
          results.push({
            title,
            price,
            priceText,
          });
        }
      });

      return results;
    });

    await page.close();

    return { success: true, listings, count: listings.length };
  } catch (err) {
    console.error(`Error scraping "${query}":`, err.message);
    return { success: false, error: err.message, listings: [] };
  }
}

function analyzeListings(listings, isSold) {
  if (!listings || listings.length === 0) {
    return { count: 0, median: null, min: null, max: null, aboveRetail: 0, scalperKeywords: 0 };
  }

  const prices = listings.map(l => l.price).filter(p => p > 0).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // Count listings above retail
  const aboveRetail = listings.filter(l => l.price > RETAIL_PRICE).length;

  // Detect scalper keywords
  const scalperKeywords = listings.filter(l =>
    /sealed|unopened|limited|LE|numbered|new in box|NIB|factory sealed/i.test(l.title)
  ).length;

  return {
    count: listings.length,
    median: median ? median.toFixed(2) : null,
    min: min.toFixed(2),
    max: max.toFixed(2),
    range: `$${min.toFixed(2)} - $${max.toFixed(2)}`,
    aboveRetail,
    belowRetail: listings.filter(l => l.price < RETAIL_PRICE).length,
    scalperKeywords,
    averagePrice: (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2),
  };
}

async function main() {
  console.log('=== Wallhack Sora Mousepad eBay Market Research ===');
  console.log(`Retail Price: $${RETAIL_PRICE}\n`);

  const results = {};

  // Scrape sold listings for each query
  for (const query of QUERIES) {
    const sold = await scrapeEbayQuery(query, true);
    const active = await scrapeEbayQuery(query, false);

    const soldAnalysis = analyzeListings(sold.listings, true);
    const activeAnalysis = analyzeListings(active.listings, false);

    results[query] = {
      sold: {
        success: sold.success,
        error: sold.error,
        analysis: soldAnalysis,
        sampleListings: sold.listings.slice(0, 5),
      },
      active: {
        success: active.success,
        error: active.error,
        analysis: activeAnalysis,
        sampleListings: active.listings.slice(0, 5),
      }
    };

    // Brief pause between queries
    await new Promise(r => setTimeout(r, 3000));
  }

  // Output summary
  console.log('\n\n========== SUMMARY REPORT ==========\n');

  for (const [query, data] of Object.entries(results)) {
    console.log(`\n--- ${query} ---`);

    if (data.sold.success) {
      console.log(`\nSOLD LISTINGS:`);
      console.log(`  Count: ${data.sold.analysis.count}`);
      if (data.sold.analysis.median) {
        console.log(`  Median Price: $${data.sold.analysis.median}`);
        console.log(`  Price Range: ${data.sold.analysis.range}`);
        console.log(`  Average Price: $${data.sold.analysis.averagePrice}`);
        console.log(`  Above Retail ($${RETAIL_PRICE}): ${data.sold.analysis.aboveRetail}/${data.sold.analysis.count}`);
        console.log(`  Below Retail: ${data.sold.analysis.belowRetail}/${data.sold.analysis.count}`);
        console.log(`  Listings with scalper keywords (sealed/unopened/LE/numbered): ${data.sold.analysis.scalperKeywords}`);

        if (data.sold.sampleListings.length > 0) {
          console.log(`  Sample sold listings:`);
          data.sold.sampleListings.forEach(l => {
            console.log(`    - ${l.title.substring(0, 80)} | $${l.price.toFixed(2)}`);
          });
        }
      }
    } else {
      console.log(`SOLD LISTINGS: Failed to scrape - ${data.sold.error}`);
    }

    if (data.active.success) {
      console.log(`\nACTIVE LISTINGS:`);
      console.log(`  Count: ${data.active.analysis.count}`);
      if (data.active.analysis.median) {
        console.log(`  Median Ask Price: $${data.active.analysis.median}`);
        console.log(`  Price Range: ${data.active.analysis.range}`);
        console.log(`  Average Ask: $${data.active.analysis.averagePrice}`);
        console.log(`  Above Retail ($${RETAIL_PRICE}): ${data.active.analysis.aboveRetail}/${data.active.analysis.count}`);
        console.log(`  Below Retail: ${data.active.analysis.belowRetail}/${data.active.analysis.count}`);
        console.log(`  Listings with scalper keywords: ${data.active.analysis.scalperKeywords}`);

        if (data.active.sampleListings.length > 0) {
          console.log(`  Sample active listings:`);
          data.active.sampleListings.forEach(l => {
            console.log(`    - ${l.title.substring(0, 80)} | $${l.price.toFixed(2)}`);
          });
        }
      }
    } else {
      console.log(`ACTIVE LISTINGS: Failed to scrape - ${data.active.error}`);
    }
  }

  // Write full results to file
  fs.writeFileSync('./wallhack-sora-ebay-results.json', JSON.stringify(results, null, 2));
  console.log('\n\nFull results saved to wallhack-sora-ebay-results.json');
}

main().catch(console.error);
