#!/usr/bin/env node
/**
 * backfill-dealernetx-historical.mjs
 * Search DealernetX with year-by-year queries to find products 1990-2025
 * Multiple brands per year = better coverage than single "Topps baseball" query
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { wholesaleSearch } from './lib/prices.mjs';

const ROOT = '.';

const SEARCH_STRATEGIES = {
  baseball: [
    // Years × brands
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Topps baseball`),
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Panini baseball`),
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} baseball card`),
    // Specific sets
    'Topps Chrome baseball', 'Topps Heritage baseball', 'Bowman baseball',
    'Upper Deck baseball', 'Leaf baseball', 'Score baseball',
  ],
  basketball: [
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Panini basketball`),
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} basketball card`),
    'Panini Flawless basketball', 'Panini Prizm basketball', 'NBA basketball',
  ],
  football: [
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Panini football`),
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} football card`),
    'Panini Flawless football', 'Panini Prizm football', 'NFL football',
  ],
  soccer: [
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} Topps soccer`),
    ...Array.from({ length: 36 }, (_, i) => `${1990 + i} soccer card`),
    'World Cup card', 'Champions League card', 'Premier League card',
  ],
  pokemon: [
    ...Array.from({ length: 5 }, (_, i) => `Scarlet Violet booster ${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `SV${String(i + 4).padStart(2, '0')} booster`),
    'Pokemon booster box', 'Pokemon ETB', 'Pokemon base set',
  ],
  mtg: [
    ...Array.from({ length: 10 }, (_, i) => `Magic ${2025 - i}`),
    'MTG booster', 'Magic booster box', 'Secret Lair',
  ],
  lorcana: [
    ...Array.from({ length: 3 }, (_, i) => `Lorcana set ${i + 1}`),
    'Disney Lorcana', 'Lorcana booster', 'Illumineer box',
  ],
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

function extractParallels(name) {
  const parallels = [];
  [
    ['1/1', /1\/1|one\s+of\s+one/i],
    ['1/5', /1\/5|one\s+of\s+five/i],
    ['1/10', /1\/10|one\s+of\s+ten/i],
    ['Gold', /\bgold\b/i],
    ['Red', /red\s+parallel/i],
    ['Refractor', /refractor/i],
  ].forEach(([name, pat]) => {
    if (pat.test(name)) parallels.push(name);
  });
  return parallels;
}

function mapToCat(query) {
  for (const [cat, queries] of Object.entries(SEARCH_STRATEGIES)) {
    if (queries.some(q => q === query || query.includes(cat.split('_')[0]))) return cat;
  }
  return null;
}

async function backfillCategory(category, queries, dbPath) {
  console.log(`\n[${category}] running ${queries.length} searches...`);
  const db = await loadDb(dbPath);
  if (!db.sets) db.sets = {};

  const seen = new Set(Object.keys(db.sets));
  let added = 0;

  for (const query of queries) {
    try {
      const results = await wholesaleSearch(query);
      if (!results || results.length === 0) continue;

      for (const product of results) {
        if (!product || !product.name) continue;

        const setKey = product.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        if (seen.has(setKey)) continue;

        db.sets[setKey] = {
          set_name: product.name,
          source: 'dealernetx',
          price: product.market?.lowestAsk || product.market?.lastTrade || null,
          url: product.url,
          fetched_date: new Date().toISOString(),
        };

        seen.add(setKey);
        added++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.error(`    error on "${query}":`, e.message);
    }
  }

  db._meta = { ...db._meta, lastUpdated: new Date().toISOString() };
  await saveDb(dbPath, db);
  console.log(`[${category}] added ${added} products (total: ${Object.keys(db.sets).length})`);
  return added;
}

async function main() {
  console.log('[backfill-hist] year-by-year + brand search for 1990-2025...');

  let totalAdded = 0;

  // Map categories to DBs
  const categoryDbs = {
    baseball: join(ROOT, 'card-products-special.json'),
    basketball: join(ROOT, 'card-products-special.json'),
    football: join(ROOT, 'card-products-special.json'),
    soccer: join(ROOT, 'card-products-special.json'),
    pokemon: join(ROOT, 'set-history.json'),
    mtg: join(ROOT, 'set-history-mtg.json'),
    lorcana: join(ROOT, 'set-history-lorcana.json'),
  };

  for (const [category, queries] of Object.entries(SEARCH_STRATEGIES)) {
    const count = await backfillCategory(category, queries, categoryDbs[category]);
    totalAdded += count;
  }

  console.log(`\n[backfill-hist] complete: ${totalAdded} products added`);
  process.exit(0);
}

main().catch(e => {
  console.error('[backfill-hist] fatal:', e);
  process.exit(1);
});
