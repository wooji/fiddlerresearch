#!/usr/bin/env node
/**
 * backfill-products-comprehensive.mjs
 * Exhaustive search per handbook product types
 * Pokemon/MTG/Lorcana/One Piece/Sports per DealernetX
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { wholesaleSearch } from './lib/prices.mjs';

const ROOT = '.';
const ERROR_LOG = join(ROOT, 'product-backfill-errors.log');

const log = msg => {
  console.log(msg);
  process.stdout.write(msg + '\n');
};

const logErr = (ctx, err) => appendFileSync(ERROR_LOG, `[${ctx}] ${err.message}\n`);

// Comprehensive product search queries per handbook
const SEARCHES = {
  pokemon: [
    // Sets/years
    'Pokemon 2024', 'Pokemon 2023', 'Pokemon 2022', 'Pokemon 2021', 'Pokemon 2020',
    // Product types
    'Pokemon booster box', 'Pokemon display booster', 'Pokemon tin', 'Pokemon collection box',
    'Pokemon ETB', 'Elite Trainer Box', 'Pokemon bundle', 'Pokemon blister',
    // Specific sets (sample)
    'Scarlet Violet', 'Sword Shield', 'Crown Zenith', 'Paldea Evolved', 'Base Set',
    'Paradox Rift', 'Obsidian Flames', 'Temporal Forces', 'Prismatic Evolution',
  ],
  mtg: [
    // Years/blocks
    'Magic 2024', 'Magic 2023', 'Magic 2022', 'MTG booster', 'MTG set',
    // Product types
    'MTG collector booster', 'MTG draft booster', 'MTG bundle', 'MTG play set',
    'Magic collector box', 'Magic gift bundle', 'Secret Lair', 'Magic collector packs',
    // Specific sets (sample)
    'MTG Duskmourn', 'MTG Bloomburrow', 'MTG Thunder Junction', 'MTG Lord of Rings',
    'MTG Murders', 'MTG Wilds of Eldraine', 'MTG Lost Caverns', 'MTG One Ring',
  ],
  lorcana: [
    // Product types
    'Lorcana booster box', 'Lorcana booster display', 'Lorcana booster pack', 'Lorcana blister',
    'Lorcana collection', 'Lorcana starter set', 'Lorcana gift set', 'Lorcana trove',
    'Disney Lorcana', 'Illumineer trove', 'Lorcana premium',
    // Sets/years
    'Lorcana 2024', 'Lorcana 2023', 'Lorcana chapter', 'Lorcana series',
  ],
  one_piece: [
    'One Piece booster box', 'One Piece double box', 'One Piece collection',
    'One Piece card', 'One Piece TCG', 'One Piece 2024', 'One Piece 2023',
  ],
  baseball: [
    '2024 Topps', '2025 Topps', '2023 Topps', 'Topps Chrome', 'Topps Heritage',
    'Topps Bowman', 'Panini baseball', 'baseball card set',
  ],
  basketball: [
    '2024 Panini', '2025 Panini', 'Panini Prizm', 'Panini Flawless',
    'Panini basketball', 'NBA card set',
  ],
  football: [
    '2024 Panini', '2025 Panini', 'Panini National Treasures', 'Panini Flawless',
    'Panini football', 'NFL card set',
  ],
};

const PRODUCT_DBS = {
  pokemon: 'set-history.json',
  mtg: 'set-history-mtg.json',
  lorcana: 'set-history-lorcana.json',
  one_piece: 'set-history-one-piece.json',
  baseball: 'card-products-special.json',
  basketball: 'card-products-special.json',
  football: 'card-products-special.json',
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
  log('[comprehensive] starting exhaustive product search...');

  const allSeen = {};
  Object.values(PRODUCT_DBS).forEach(dbFile => {
    const db = loadDb(dbFile);
    Object.keys(db.sets || {}).forEach(k => allSeen[k] = true);
  });

  let globalAdded = 0;

  for (const [cat, queries] of Object.entries(SEARCHES)) {
    log(`\n[${cat}] ${queries.length} searches`);
    const dbPath = join(ROOT, PRODUCT_DBS[cat]);
    const db = loadDb(dbPath);
    if (!db.sets) db.sets = {};

    let catAdded = 0;

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      process.stdout.write(`  [${i + 1}/${queries.length}] ${query}...`);

      try {
        const results = await wholesaleSearch(query);
        let added = 0;

        for (const prod of results || []) {
          if (!prod?.name) continue;

          const key = prod.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          if (allSeen[key]) continue;

          db.sets[key] = {
            set_name: prod.name,
            category: cat,
            source: 'dealernetx',
            price: prod.market?.lowestAsk ?? null,
          };

          allSeen[key] = true;
          added++;
        }

        process.stdout.write(` +${added}\n`);
        catAdded += added;

        // Rate limit
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        process.stdout.write(` ERROR\n`);
        logErr(`${cat}:${query}`, e);
      }
    }

    saveDb(dbPath, db);
    log(`[${cat}] added ${catAdded}, db now ${Object.keys(db.sets).length}`);
    globalAdded += catAdded;
  }

  log(`\n[comprehensive] COMPLETE: ${globalAdded} new products`);
}

backfill().catch(e => {
  log(`[FATAL] ${e.message}`);
  process.exit(1);
});
