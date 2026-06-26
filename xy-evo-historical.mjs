/**
 * XY Evolutions Historical Pricing Research
 * Search Reddit, eBay, and web archives for verified price points
 */
import { chromium } from 'playwright';

/**
 * Search Reddit for price discussions using old.reddit.com
 */
async function searchRedditForPrices() {
  const queries = [
    'XY Evolutions ETB price',
    'XY Evolutions Booster Box price',
    'XY Evolutions pack price',
    'XY Evolutions grail pricing',
  ];

  const allPosts = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    for (const q of queries) {
      try {
        await page.goto(`https://old.reddit.com/search?q=${encodeURIComponent(q)}&sort=new&t=all&limit=100`,
          { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1000);

        const posts = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.thing'))
            .map(el => ({
              title: el.querySelector('a.title')?.textContent?.trim(),
              sub: el.querySelector('.subreddit')?.textContent?.trim(),
              text: el.querySelector('.expando')?.textContent?.trim(),
            }))
            .filter(p => p.title && (p.title.includes('$') || p.text?.includes('$')))
            .slice(0, 20)
        );

        allPosts.push(...posts);
        console.log(`  "${q}" → ${posts.length} posts with prices`);
      } catch (e) {
        console.log(`  "${q}" → error: ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  return allPosts;
}

/**
 * Direct eBay sold listing search for price history
 */
async function searchEbaySoldListings() {
  const results = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const queries = [
    'XY Evolutions Elite Trainer Box',
    'XY Evolutions Booster Box',
    'XY Evolutions Booster Pack',
  ];

  try {
    for (const q of queries) {
      try {
        const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);

        const prices = await page.evaluate(() => {
          const pageText = document.body.innerText;
          const matches = pageText.match(/\$[\d,]+\.?\d*/g) || [];
          const prices = [];

          for (const m of matches) {
            const price = parseFloat(m.replace(/[$,]/g, ''));
            if (price > 20 && price < 5000) {
              prices.push(price);
            }
          }

          return [...new Set(prices)].slice(0, 15);
        });

        if (prices.length > 0) {
          const sorted = prices.sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          console.log(`  ${q}:`);
          console.log(`    Median: $${median.toFixed(2)} (n=${prices.length})`);
          console.log(`    Range: $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`);
          results.push({ product: q, prices, median, count: prices.length });
        } else {
          console.log(`  ${q}: No sold listings found`);
        }
      } catch (e) {
        console.log(`  ${q}: error`);
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Main research execution
 */
async function runFullResearch() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('XY Evolutions Historical Pricing Research');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('2026 Current TCGPlayer Prices:');
  console.log('  ETB (Mega): $542.85');
  console.log('  Booster Box: $2440.51');
  console.log('  Single Pack: $62.38');
  console.log('  Product MSRP: ETB $59.99 | BB $144 | Pack $4\n');

  console.log('Searching current eBay sold listings for market data...');
  const ebay = await searchEbaySoldListings();
  console.log();

  console.log('Searching Reddit for historical price discussions...');
  const reddit = await searchRedditForPrices();
  console.log();

  console.log('═══════════════════════════════════════════════════════════════');
}

runFullResearch().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
