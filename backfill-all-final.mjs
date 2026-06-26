#!/usr/bin/env node
/**
 * backfill-all-final.mjs
 * Comprehensive year-by-year DealernetX backfill with explicit logging
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { wholesaleSearch } from './lib/prices.mjs';

const ROOT = '.';
const log = (msg) => {
  console.log(msg);
  process.stdout.write(msg + '\n');
};

// All categories with search queries
const CATEGORIES = {
  baseball: [
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Topps baseball`),
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Panini baseball`),
    'Topps Chrome', 'Bowman baseball', 'Upper Deck baseball',
  ],
  basketball: [
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Panini basketball`),
    'Flawless', 'Prizm basketball', 'NBA',
  ],
  football: [
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Panini football`),
    'National Treasures', 'Flawless football', 'NFL',
  ],
  soccer: [
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Topps soccer`),
    'World Cup', 'Champions League',
  ],
  pokemon: ['Pokemon booster', 'Scarlet Violet', 'ETB', 'Base set'],
  mtg: ['Magic booster', 'MTG', 'Secret Lair', 'Ravnica'],
  lorcana: ['Lorcana', 'Disney Lorcana', 'Illumineer'],
};

const DB_PATHS = {
  baseball: join(ROOT, 'card-products-special.json'),
  basketball: join(ROOT, 'card-products-special.json'),
  football: join(ROOT, 'card-products-special.json'),
  soccer: join(ROOT, 'card-products-special.json'),
  pokemon: join(ROOT, 'set-history.json'),
  mtg: join(ROOT, 'set-history-mtg.json'),
  lorcana: join(ROOT, 'set-history-lorcana.json'),
};

async function loadDb(dbPath) {
  try {
    return JSON.parse(readFileSync(dbPath, 'utf8'));
  } catch {
    return { _meta: { lastUpdated: new Date().toISOString(), version: 1 }, sets: {} };
  }
}

async function saveDb(dbPath, db) {
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

async function backfillCategory(cat, queries) {
  log(`\n[${cat}] ${queries.length} queries`);
  const dbPath = DB_PATHS[cat];
  const db = await loadDb(dbPath);
  if (!db.sets) db.sets = {};

  const seen = new Set(Object.keys(db.sets));
  let added = 0;
  let searched = 0;

  for (const query of queries) {
    searched++;
    if (searched % 10 === 0) log(`  [${searched}/${queries.length}] ${query}`);

    try {
      // Timeout wrapper: abort if search takes >70s
      const searchPromise = wholesaleSearch(query);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('search timeout')), 70000)
      );
      const results = await Promise.race([searchPromise, timeoutPromise]);
      for (const product of results || []) {
        if (!product?.name) continue;

        const key = product.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        if (!seen.has(key)) {
          db.sets[key] = {
            set_name: product.name,
            source: 'dealernetx',
            price: product.market?.lowestAsk ?? product.market?.lastTrade,
          };
          seen.add(key);
          added++;
        }
      }

      await new Promise(r => setTimeout(r, 900));
    } catch (e) {
      log(`    ERROR on "${query}": ${e.message}`);
    }
  }

  db._meta.lastUpdated = new Date().toISOString();
  await saveDb(dbPath, db);
  log(`[${cat}] added ${added}, total ${Object.keys(db.sets).length}`);
  return added;
}

async function main() {
  log('[backfill-final] starting comprehensive enumeration...');
  let totalAdded = 0;

  for (const [cat, queries] of Object.entries(CATEGORIES)) {
    const count = await backfillCategory(cat, queries);
    totalAdded += count;
  }

  log(`\n[backfill-final] complete: ${totalAdded} products`);
  process.exit(0);
}

main().catch(e => {
  log(`[backfill-final] FATAL: ${e.message}`);
  process.exit(1);
});
