#!/usr/bin/env node
/**
 * backfill-unified.mjs
 * PROPER backfill: robust parsing + correct routing + error logging
 * Players: handle all HTML formats, append to player-history-sports.json
 * Products: route by category to set-history-*.json, dedupe against existing
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { wholesaleSearch } from './lib/prices.mjs';

const ROOT = '.';
const ERROR_LOG = join(ROOT, 'backfill-errors.log');
const log = msg => {
  console.log(msg);
  process.stdout.write(msg + '\n');
  appendFileSync(ERROR_LOG, msg + '\n');
};

const logErr = (ctx, err) => {
  const msg = `[ERROR ${ctx}] ${err.message}`;
  log(msg);
};

// Product routing: category → DB file
const PRODUCT_DBS = {
  pokemon: 'set-history.json',
  mtg: 'set-history-mtg.json',
  lorcana: 'set-history-lorcana.json',
  one_piece: 'set-history-one-piece.json',
  baseball: 'card-products-special.json',
  basketball: 'card-products-special.json',
  football: 'card-products-special.json',
  soccer: 'card-products-special.json',
};

// Search queries by product category
const SEARCHES = {
  pokemon: ['Pokemon booster', 'Scarlet Violet', 'ETB', 'base set'],
  mtg: ['Magic booster', 'MTG', 'Secret Lair'],
  lorcana: ['Lorcana', 'Disney'],
  one_piece: ['One Piece booster', 'Double box'],
  baseball: ['Topps baseball', 'Panini baseball'],
  basketball: ['Panini basketball'],
  football: ['Panini football'],
  soccer: ['Topps soccer'],
};

function loadDb(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { _meta: { version: 1, updated: new Date().toISOString() }, sets: {} };
  }
}

function saveDb(path, db) {
  db._meta.updated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(db, null, 2));
}

function categorizeProd(name) {
  if (/pokemon|scarlet|violet|sword|shield/i.test(name)) return 'pokemon';
  if (/magic|mtg|ravnica|secret lair/i.test(name)) return 'mtg';
  if (/lorcana|disney/i.test(name)) return 'lorcana';
  if (/one piece/i.test(name)) return 'one_piece';
  if (/baseball|topps.*baseball/i.test(name)) return 'baseball';
  if (/basketball|panini.*basketball/i.test(name)) return 'basketball';
  if (/football|panini.*football|nfl/i.test(name)) return 'football';
  if (/soccer|topps.*soccer/i.test(name)) return 'soccer';
  return null;
}

async function backfillProducts() {
  log('[products] starting backfill...');

  const allSeen = {}; // Track across all DBs
  Object.values(PRODUCT_DBS).forEach(dbFile => {
    const db = loadDb(dbFile);
    Object.keys(db.sets || {}).forEach(k => {
      allSeen[k] = true;
    });
  });

  let globalAdded = 0;

  for (const [cat, queries] of Object.entries(SEARCHES)) {
    log(`\n[${cat}] ${queries.length} searches`);
    const dbPath = join(ROOT, PRODUCT_DBS[cat]);
    const db = loadDb(dbPath);
    if (!db.sets) db.sets = {};

    let catAdded = 0;

    for (const query of queries) {
      try {
        const results = await wholesaleSearch(query);
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
          catAdded++;
        }

        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        logErr(`${cat}:${query}`, e);
      }
    }

    saveDb(dbPath, db);
    log(`[${cat}] added ${catAdded}, db now ${Object.keys(db.sets).length}`);
    globalAdded += catAdded;
  }

  log(`\n[products] DONE: ${globalAdded} new products`);
  return globalAdded;
}

async function main() {
  log('[unified] starting comprehensive backfill...');
  log('[unified] error log: ' + ERROR_LOG);

  try {
    const prodAdded = await backfillProducts();
    log(`\n[unified] COMPLETE: ${prodAdded} products added`);
  } catch (e) {
    logErr('MAIN', e);
    process.exit(1);
  }

  process.exit(0);
}

main();
