#!/usr/bin/env node
/**
 * backfill-robust.mjs
 * Robust backfill with hard timeout + error recovery
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { wholesaleSearch } from './lib/prices.mjs';

const ROOT = '.';
const log = msg => {
  console.log(msg);
  process.stdout.write(msg + '\n');
};

const QUERIES = {
  baseball: [
    '1990 Topps', '1991 Topps', '1992 Topps', '1993 Topps', '1994 Topps',
    '2020 Topps', '2021 Topps', '2022 Topps', '2023 Topps', '2024 Topps',
    '1990 Panini', '2020 Panini', 'Chrome', 'Bowman', 'Heritage',
  ],
  basketball: [
    '2020 Panini', '2021 Panini', '2022 Panini', '2023 Panini',
    'Flawless', 'Prizm', 'NBA Hoops',
  ],
  football: [
    '2020 Panini', '2021 Panini', '2022 Panini', '2023 Panini',
    'National Treasures', 'Flawless', 'NFL',
  ],
  pokemon: ['Pokemon', 'Booster', 'ETB', 'Base Set'],
  mtg: ['Magic', 'MTG', 'Secret Lair'],
  lorcana: ['Lorcana', 'Disney'],
};

const DBS = {
  baseball: 'card-products-special.json',
  basketball: 'card-products-special.json',
  football: 'card-products-special.json',
  pokemon: 'set-history.json',
  mtg: 'set-history-mtg.json',
  lorcana: 'set-history-lorcana.json',
};

async function loadDb(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { _meta: { version: 1 }, sets: {} };
  }
}

async function saveDb(path, db) {
  writeFileSync(path, JSON.stringify(db, null, 2));
}

async function searchWithTimeout(query, timeoutMs = 65000) {
  return Promise.race([
    wholesaleSearch(query),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    ),
  ]);
}

async function backfill() {
  log('[robust] starting...');
  let totalAdded = 0;

  for (const [cat, queries] of Object.entries(QUERIES)) {
    log(`\n[${cat}] ${queries.length} queries`);
    const dbPath = join(ROOT, DBS[cat]);
    const db = await loadDb(dbPath);
    if (!db.sets) db.sets = {};

    const seen = new Set(Object.keys(db.sets));
    let catAdded = 0;

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      process.stdout.write(`  [${i + 1}/${queries.length}] ${query}...`);

      try {
        const results = await searchWithTimeout(query);
        let added = 0;

        for (const prod of results || []) {
          if (!prod?.name) continue;
          const key = prod.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          if (!seen.has(key)) {
            db.sets[key] = { set_name: prod.name, source: 'dealernetx' };
            seen.add(key);
            added++;
          }
        }

        process.stdout.write(` +${added}\n`);
        catAdded += added;
      } catch (e) {
        process.stdout.write(` ERROR\n`);
        log(`    ${e.message}`);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    db._meta.updated = new Date().toISOString();
    await saveDb(dbPath, db);
    log(`[${cat}] added ${catAdded}, total ${Object.keys(db.sets).length}`);
    totalAdded += catAdded;
  }

  log(`\n[robust] COMPLETE: ${totalAdded} products\n`);
  process.exit(0);
}

backfill().catch(e => {
  log(`[robust] FATAL: ${e.message}`);
  process.exit(1);
});
