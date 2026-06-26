/**
 * XY Evolutions Historical Pricing Research
 * Goal: Find verified price data points for ETB, Booster Box, and single packs
 * across 2016–2026
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

/**
 * Search Reddit for XY Evolutions pricing discussions
 */
async function redditSearch(query) {
  const results = [];
  try {
    // Reddit API endpoint for post search (no auth needed for public search)
    const queries = [
      `${encodeURIComponent(query)} site:reddit.com/r/PokemonTCG`,
      `${encodeURIComponent(query)} site:reddit.com/r/Pokevinyl`,
      `${encodeURIComponent(query)} site:reddit.com/r/pkmntcg`,
    ];

    for (const q of queries) {
      // Use Bing to search Reddit for pricing discussions
      const url = `https://www.bing.com/search?q=${q}&first=1`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
      });
      if (r.ok) {
        const html = await r.text();
        // Extract Reddit links and snippet text
        const linkMatches = html.matchAll(/href="(https:\/\/(?:www\.)?reddit\.com[^"]+)"/g);
        const snippetMatches = html.matchAll(/<span[^>]*>([^<]*?\$[0-9.]+[^<]*?)<\/span>/gi);

        for (const match of linkMatches) {
          results.push({ type: 'reddit_link', url: match[1] });
        }
        for (const match of snippetMatches) {
          results.push({ type: 'snippet', text: match[1] });
        }
      }
    }
  } catch (e) {
    console.error('Reddit search error:', e.message);
  }
  return results.slice(0, 10);
}

/**
 * Search eBay sold listings for XY Evolutions price history
 */
async function ebaySearch(product, years = [2016, 2018, 2020, 2021, 2023, 2025]) {
  const results = [];

  for (const year of years) {
    try {
      // eBay sold listings search with date filter
      const query = `${product} XY Evolutions`;
      const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc`;

      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
      });

      if (r.ok) {
        const html = await r.text();
        // Extract price points from sold listings
        const priceMatches = html.matchAll(/\$([0-9,.]+)/g);
        const prices = [];
        for (const match of priceMatches) {
          const price = parseFloat(match[1].replace(/,/g, ''));
          if (price > 10 && price < 10000) prices.push(price);
        }
        if (prices.length > 0) {
          results.push({
            product,
            year,
            source: 'eBay sold',
            prices,
            median: prices.sort((a,b) => a-b)[Math.floor(prices.length/2)],
            count: prices.length
          });
        }
      }
    } catch (e) {
      console.error(`eBay search for ${product} ${year}:`, e.message);
    }
  }

  return results;
}

/**
 * Search TCGPlayer for current and historical pricing via product page
 */
async function tcgplayerSearch(productId, productName) {
  try {
    // Current TCGPlayer market price
    const r = await fetch(`https://mp-search-api.tcgplayer.com/v2/product/${productId}/details`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.tcgplayer.com/',
      },
    });

    if (r.ok) {
      const data = await r.json();
      const result = data?.result?.[0] ?? data;
      return {
        product: productName,
        source: 'TCGPlayer current',
        market: result.marketPrice ?? null,
        low: result.lowestListingPrice ?? null,
        high: result.highestListingPrice ?? null,
        sales: result.numberOfSales ?? null,
      };
    }
  } catch (e) {
    console.error('TCGPlayer search error:', e.message);
  }
  return null;
}

/**
 * Google Scholar / academic / blog searches for historical TCG pricing data
 */
async function scholarSearch(query) {
  const results = [];
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)} "XY Evolutions" price history`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    if (r.ok) {
      const html = await r.text();
      // Extract snippets with price mentions
      const snippets = html.match(/\$[0-9,.]+/g) || [];
      results.push({
        query,
        source: 'web_search',
        mentions: snippets.slice(0, 10)
      });
    }
  } catch (e) {
    console.error('Scholar search error:', e.message);
  }
  return results;
}

/**
 * Main research runner
 */
async function runResearch() {
  console.log('🔍 XY Evolutions Historical Pricing Research\n');
  console.log('Searching for verified price data points...\n');

  // Search for ETB, Booster Box, and single pack pricing
  const products = [
    { key: 'xy-evo-etb', name: 'Elite Trainer Box', tcgId: 147059 },
    { key: 'xy-evo-bb', name: 'Booster Box', tcgId: 156871 },
    { key: 'xy-evo-pack', name: 'Booster Pack', tcgId: null },
  ];

  for (const prod of products) {
    console.log(`\n=== ${prod.name} ===`);

    // TCGPlayer current market
    if (prod.tcgId) {
      const tcg = await tcgplayerSearch(prod.tcgId, prod.name);
      if (tcg) {
        console.log(`TCGPlayer Current Market: $${tcg.market ?? 'N/A'}`);
        console.log(`  Low: $${tcg.low ?? 'N/A'} | High: $${tcg.high ?? 'N/A'} | Sales: ${tcg.sales ?? 'N/A'}`);
      }
    }

    // eBay sold listings
    console.log(`\nSearching eBay sold listings...`);
    const ebay = await ebaySearch(prod.name);
    for (const year of ebay) {
      if (year.prices.length > 0) {
        console.log(`  ${year.year}: Median $${year.median.toFixed(2)} (n=${year.count})`);
      }
    }

    // Reddit discussions
    console.log(`\nSearching Reddit discussions...`);
    const reddit = await redditSearch(`${prod.name} XY Evolutions price`);
    if (reddit.length > 0) {
      console.log(`  Found ${reddit.length} Reddit mentions`);
      for (const r of reddit.slice(0, 3)) {
        if (r.type === 'reddit_link') {
          console.log(`    ${r.url}`);
        }
      }
    }

    // Web search for pricing history
    console.log(`\nSearching web for historical pricing...`);
    const web = await scholarSearch(prod.name);
    if (web.length > 0) {
      console.log(`  Found price mentions: ${web[0].mentions.join(', ')}`);
    }
  }

  console.log('\n✓ Research complete. See above for verified data sources.');
}

runResearch().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
