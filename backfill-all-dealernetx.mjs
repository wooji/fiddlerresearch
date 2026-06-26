#!/usr/bin/env node
/**
 * backfill-all-dealernetx.mjs
 * Comprehensive scrape of DealernetX for all sports + TCG categories
 * Uses wholesaleSearch() to enumerate products → append to respective DBs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { wholesaleSearch } from './lib/prices.mjs';

const ROOT = '.';

// Category → DB path + search queries
const CATEGORIES = {
  baseball: {
    db: join(ROOT, 'card-products-special.json'),
    queries: ['Topps baseball', 'Panini baseball', '2024 baseball', '2025 baseball', 'Chrome baseball', 'Bowman baseball'],
    sport: 'baseball',
  },
  basketball: {
    db: join(ROOT, 'card-products-special.json'),
    queries: ['Panini basketball', 'Flawless basketball', '2024 basketball', '2025 basketball', 'NBA cards'],
    sport: 'basketball',
  },
  football: {
    db: join(ROOT, 'card-products-special.json'),
    queries: ['Panini football', 'National Treasures', '2024 football', '2025 football', 'NFL cards'],
    sport: 'football',
  },
  soccer: {
    db: join(ROOT, 'card-products-special.json'),
    queries: ['Topps soccer', 'Panini soccer', 'World Cup', 'Premier League', 'Champions League'],
    sport: 'soccer',
  },
  pokemon: {
    db: join(ROOT, 'set-history.json'),
    queries: ['Pokemon', 'Scarlet', 'Violet', 'Sword Shield', 'ETB', 'Booster box'],
    sport: 'pokemon',
  },
  mtg: {
    db: join(ROOT, 'set-history-mtg.json'),
    queries: ['Magic', 'MTG', 'Ravnica', 'Lord of the Rings', 'Fallout'],
    sport: 'mtg',
  },
  lorcana: {
    db: join(ROOT, 'set-history-lorcana.json'),
    queries: ['Lorcana', 'Disney Lorcana', 'Illumineer'],
    sport: 'lorcana',
  },
};

async function loadDb(dbPath) {
  try {
    return JSON.parse(readFileSync(dbPath, 'utf8'));
  } catch {
    // Return empty structure matching expected DB format
    return { _meta: { lastUpdated: new Date().toISOString(), version: 1 }, sets: {}, players: {} };
  }
}

async function saveDb(dbPath, db) {
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function extractParallels(name) {
  const parallels = [];
  const patterns = [
    { name: '1/1', pattern: /1\/1|one\s+of\s+one/i },
    { name: '1/5', pattern: /1\/5|one\s+of\s+five/i },
    { name: '1/10', pattern: /1\/10|one\s+of\s+ten/i },
    { name: '1/25', pattern: /1\/25|one\s+of\s+twenty-?five/i },
    { name: 'Gold', pattern: /\bgold\b|#d|limited/i },
    { name: 'Red', pattern: /red\s+parallel|ruby/i },
    { name: 'Black', pattern: /black\s+parallel|ebony/i },
    { name: 'Refractor', pattern: /refractor/i },
  ];
  patterns.forEach(p => {
    if (p.pattern.test(name)) parallels.push(p.name);
  });
  return parallels;
}

function extractSpecialCards(name) {
  const specials = [];
  const patterns = [
    { type: 'autograph', pattern: /\bauto\b|signed|autographed/i },
    { type: 'game_used', pattern: /game.?used|gu|jersey|bat/i },
    { type: 'memorabilia', pattern: /mem|relic|swatch/i },
    { type: 'rookie_auto', pattern: /rookie\s+auto|rc\s+auto/i },
    { type: 'dual_auto', pattern: /dual\s+auto|dual.?signed/i },
  ];
  specials.forEach(p => {
    if (p.pattern.test(name)) specials.push(p.type);
  });
  return specials;
}

async function backfillCategory(category, config) {
  console.log(`\n[${category}] searching DealernetX...`);
  const db = await loadDb(config.db);
  const seenProducts = new Set();
  let totalFound = 0;

  for (const query of config.queries) {
    try {
      console.log(`  searching: "${query}"`);
      const results = await wholesaleSearch(query);

      if (!results || results.length === 0) {
        console.log(`    → 0 results`);
        continue;
      }

      console.log(`    → ${results.length} results`);

      for (const product of results) {
        if (!product || !product.name) continue;

        const setKey = product.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        // Dedupe by key
        if (seenProducts.has(setKey)) continue;
        seenProducts.add(setKey);

        // Extract market data
        const market = product.market || {};
        const unitPrice = market.lowestAsk || market.lastTrade || 0;

        // Prepare entry
        const entry = {
          set_name: product.name,
          sport: config.sport,
          category,
          upc: product.upc,
          source: 'dealernetx',
          dealernetx_price: unitPrice,
          dealernetx_url: product.url,
          market: {
            highest_bid: market.highestBid || null,
            lowest_ask: market.lowestAsk || null,
            last_trade: market.lastTrade || null,
          },
          parallels: extractParallels(product.name),
          special_cards: extractSpecialCards(product.name),
          fetched_date: new Date().toISOString(),
        };

        // Append to DB
        if (!db.sets) db.sets = {};
        db.sets[setKey] = entry;
        totalFound++;
      }

      // Rate limit: 1s between queries
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`    error:`, e.message);
    }
  }

  db._meta = db._meta || {};
  db._meta.lastUpdated = new Date().toISOString();
  await saveDb(config.db, db);

  console.log(`[${category}] saved ${totalFound} products to ${config.db}`);
  return totalFound;
}

async function main() {
  console.log('[backfill-all] starting comprehensive DealernetX enumeration...');
  const startTime = Date.now();

  let totalProducts = 0;
  for (const [category, config] of Object.entries(CATEGORIES)) {
    const count = await backfillCategory(category, config);
    totalProducts += count;
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n[backfill-all] complete: ${totalProducts} products in ${elapsed}s`);
  console.log('[backfill-all] databases updated with DealernetX pricing + product data');
  process.exit(0);
}

main().catch(e => {
  console.error('[backfill-all] fatal:', e);
  process.exit(1);
});
