#!/usr/bin/env node
/**
 * rebuild-products-distributed.mjs
 * Comprehensive product enumeration with proper category routing
 * Ensures all products distributed to set-history-pokemon.json, set-history-mtg.json, etc.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { wholesaleSearch } from './lib/prices.mjs';

const ROOT = '.';

const CATEGORY_QUERIES = {
  pokemon: ['Pokemon booster', 'Pokemon ETB', 'Pokemon tin', 'Scarlet Violet', 'base set', 'Pokemon 2024', 'Pokemon 2023', 'Pokemon blister'],
  mtg: ['Magic booster', 'MTG collector', 'Secret Lair', 'Magic 2024', 'Magic 2023', 'MTG bundle'],
  lorcana: ['Lorcana booster', 'Disney Lorcana', 'Lorcana trove', 'Lorcana gift', 'Illumineer'],
  one_piece: ['One Piece booster', 'One Piece card', 'One Piece TCG'],
  sports: ['Topps baseball', 'Panini basketball', 'Panini football', 'Topps Chrome', 'Bowman'],
};

const CATEGORY_DBS = {
  pokemon: 'set-history.json',
  mtg: 'set-history-mtg.json',
  lorcana: 'set-history-lorcana.json',
  one_piece: 'set-history-one-piece.json',
  sports: 'card-products-special.json',
};

function loadDb(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { _meta: { version: 1 }, sets: {} };
  }
}

function saveDb(path, db) {
  db._meta.updated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(db, null, 2));
}

async function backfill() {
  console.log('[products-dist] starting parallel category backfill (5 concurrent categories)...');

  const allSeen = {};
  Object.values(CATEGORY_DBS).forEach(dbFile => {
    const db = loadDb(join(ROOT, dbFile));
    Object.keys(db.sets || {}).forEach(k => allSeen[k] = true);
  });

  let globalAdded = 0;

  // Process categories in parallel (5 at a time)
  const catEntries = Object.entries(CATEGORY_QUERIES);
  for (let i = 0; i < catEntries.length; i += 5) {
    const batch = catEntries.slice(i, i + 5);

    const results = await Promise.all(batch.map(async ([cat, queries]) => {
      console.log(`[${cat}] starting ${queries.length} queries...`);
      const dbPath = join(ROOT, CATEGORY_DBS[cat]);
      const db = loadDb(dbPath);
      if (!db.sets) db.sets = {};

      let catAdded = 0;

      for (const query of queries) {
        try {
          const results = await wholesaleSearch(query);
          let added = 0;

          for (const prod of results || []) {
            if (!prod?.name || prod.name === 'undefined') continue;

            const key = prod.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            if (allSeen[key]) continue;

            const entry = {
              set_name: String(prod.name).trim(),
              category: cat,
              source: 'dealernetx',
              price: prod.market?.lowestAsk ?? null,
            };

            if (!entry.set_name || entry.set_name === 'undefined') continue;

            db.sets[key] = entry;
            allSeen[key] = true;
            added++;
          }

          catAdded += added;
          await new Promise(r => setTimeout(r, 600));
        } catch (e) {
          // skip on error
        }
      }

      saveDb(dbPath, db);
      console.log(`[${cat}] added ${catAdded}, total ${Object.keys(db.sets).length}`);
      return catAdded;
    }));

    globalAdded += results.reduce((a, b) => a + (b || 0), 0);
  }

  console.log(`\n[products-dist] COMPLETE: ${globalAdded} new products`);
}

backfill().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
