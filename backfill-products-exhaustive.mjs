#!/usr/bin/env node
/**
 * backfill-products-exhaustive.mjs
 * Keep scraping until NO new products found (loop until dry)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { wholesaleSearch } from './lib/prices.mjs';

const ROOT = '.';

const SEARCHES = {
  pokemon: [
    'Pokemon 2024', 'Pokemon 2023', 'Pokemon 2022', 'Pokemon 2021', 'Pokemon 2020',
    'Pokemon booster box', 'Pokemon display', 'Pokemon tin', 'Pokemon ETB', 'Pokemon bundle', 'Pokemon blister',
    'Scarlet Violet', 'Sword Shield', 'Crown Zenith', 'Paldea', 'Base Set', 'Paradox Rift', 'Obsidian', 'Temporal',
    'Prismatic', 'Pokemon collection', 'Pokemon premium', 'Pokemon box', 'Pokemon pack',
  ],
  mtg: [
    'Magic 2024', 'Magic 2023', 'Magic booster', 'MTG set', 'MTG collector', 'MTG draft', 'MTG bundle',
    'Secret Lair', 'Magic 2024', 'Duskmourn', 'Bloomburrow', 'Thunder Junction', 'LOTR', 'Murders', 'Eldraine',
    'Lost Caverns', 'One Ring', 'MTG blister', 'Magic display', 'Magic premium', 'Magic box',
  ],
  lorcana: [
    'Lorcana booster', 'Lorcana display', 'Lorcana pack', 'Lorcana blister', 'Lorcana collection', 'Lorcana starter',
    'Disney Lorcana', 'Illumineer', 'Lorcana 2024', 'Lorcana 2023', 'Lorcana chapter', 'Lorcana trove', 'Lorcana gift',
    'Lorcana premium', 'Lorcana tin', 'Lorcana box',
  ],
  one_piece: [
    'One Piece booster', 'One Piece double', 'One Piece collection', 'One Piece TCG', 'One Piece 2024', 'One Piece 2023',
    'One Piece card', 'One Piece pack', 'One Piece display', 'One Piece box', 'One Piece bundle',
  ],
  sports: [
    'Topps baseball', 'Topps Chrome', 'Topps Heritage', 'Topps Bowman', 'Panini basketball', 'Panini football',
    'Panini Prizm', 'Panini Flawless', 'Panini National Treasures', '2024 baseball', '2025 baseball', '2024 basketball',
    '2025 basketball', '2024 football', '2025 football', 'baseball card', 'basketball card', 'football card',
  ],
};

const PRODUCT_DBS = {
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

async function backfillExhaustive() {
  console.log('[exhaustive] starting loop-until-dry product backfill...');

  let roundNo = 0;
  let totalRoundAdded = 0;
  let dryRounds = 0;

  while (dryRounds < 2) {
    roundNo++;
    console.log(`\n[round ${roundNo}] starting...`);

    const allSeen = {};
    Object.values(PRODUCT_DBS).forEach(dbFile => {
      const db = loadDb(join(ROOT, dbFile));
      Object.keys(db.sets || {}).forEach(k => allSeen[k] = true);
    });

    let roundAdded = 0;

    for (const [cat, queries] of Object.entries(SEARCHES)) {
      const dbPath = join(ROOT, PRODUCT_DBS[cat]);
      const db = loadDb(dbPath);
      if (!db.sets) db.sets = {};

      let catAdded = 0;

      for (const query of queries) {
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
            catAdded++;
          }

          await new Promise(r => setTimeout(r, 400));
        } catch (e) {
          // continue on error
        }
      }

      if (catAdded > 0) {
        saveDb(dbPath, db);
        console.log(`[${cat}] +${catAdded}, total ${Object.keys(db.sets).length}`);
        roundAdded += catAdded;
      }
    }

    if (roundAdded === 0) {
      dryRounds++;
      console.log(`[round ${roundNo}] dry run #${dryRounds} (0 new products)`);
    } else {
      dryRounds = 0;
      totalRoundAdded += roundAdded;
      console.log(`[round ${roundNo}] added ${roundAdded} products`);
    }
  }

  console.log(`\n[exhaustive] COMPLETE: ${totalRoundAdded} products total from all rounds`);
}

backfillExhaustive().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
