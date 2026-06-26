#!/usr/bin/env node
// Backfill MSRP for sealed products in all set-history-*.json DBs.
// Sources: (1) known MSRP tables by category+product type (fast, no requests)
//          (2) StockX productAttributes.retailPrice for unmatched items with market>$50
// Writes msrp + msrpSource to each product record. Resume-safe (skips products with msrp).
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stockxMarket } from './lib/stockx.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LOG = join(ROOT, 'backfill-product-msrp.log');
const log = msg => { console.log(msg); appendFileSync(LOG, msg + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── MSRP Lookup Tables by category + product-type keyword ──────────────────────────────
// Format: {category: { typeKeyword: msrp }} — matched via substring of product name (lowercased).
// Based on verified publisher MSRPs.
const MSRP_TABLE = {
  pokemon: {
    'elite trainer box': 49.99, 'etb': 49.99,
    'booster box': 161.00, 'booster display': 161.00, 'booster bundle': 29.99,
    'blister': 14.99, 'blister pack': 14.99, '3-pack blister': 14.99,
    'tin': 19.99, 'collection box': 29.99, 'premium collection': 49.99,
    'build and battle': 14.99, 'build & battle': 14.99,
    'sleeved booster': 4.99, 'booster pack': 4.99,
    'collector chest': 49.99, 'advent calendar': 29.99,
    'ultra premium collection': 119.99, 'upc': 119.99,
    'special collection': 29.99, 'gift set': 29.99,
    'mini tin': 9.99, 'poke ball tin': 19.99,
    'poster collection': 19.99, 'sticker collection': 9.99,
    'binder collection': 29.99, 'tech sticker collection': 9.99,
    'illustration collection': 49.99, 'figure collection': 39.99,
    'vmax collection': 19.99, 'v collection': 14.99,
    'ex collection': 19.99, 'ex box': 19.99, 'v box': 14.99,
    'chest': 49.99, 'advent': 29.99,
    // Additional product types
    'prize pack': 9.99, 'energy prize pack': 9.99,
    'world championship deck': 14.99,
    'halfdeck': 9.99, 'half deck': 9.99,
    'first partner illustration collection': 29.99,
    'first partner collection': 29.99,
    'pencil case': 9.99,
    'tool box': 34.99,
    'pop series': 4.99,
    'code card': 0.00,
    'mcdonald': 3.99, 'happy meal': 3.99,
    'iron bundle': 29.99,
    'league battle deck': 14.99, 'league deck': 14.99,
    'battle deck': 14.99, 'ex battle deck': 14.99,
    'trainer kit': 14.99, 'theme deck': 12.99,
    'stadium challenge': 4.99, 'elite trainer box plus': 59.99,
    'base set booster': 2.99, 'pack': 4.99,
    'two player starter set': 29.99, 'starter set': 29.99,
    'collection tin': 19.99, 'poke ball': 19.99,
    'lunchbox collection': 29.99, 'backpack collection': 49.99,
    'ball collection': 29.99, 'sleeves': 9.99,
    'deck shield': 9.99, 'playmat': 24.99,
    'pencil': 9.99, 'notebook': 9.99,
    'card game mat': 24.99,
  },
  one_piece: {
    'booster box': 120.00, 'booster display': 120.00,
    'starter deck': 10.99, 'starter set': 10.99,
    'special goods set': 29.99, 'premium booster box': 144.00,
    'booster pack': 5.00,
  },
  mtg: {
    'play booster display': 143.64, 'play booster box': 143.64,
    'collector booster display': 287.76, 'collector booster box': 287.76,
    'draft booster box': 107.64, 'draft booster display': 107.64,
    'commander deck': 44.99, 'commander collection': 74.99,
    'bundle': 41.99, 'gift bundle': 79.99,
    'set booster box': 107.64, 'set booster display': 107.64,
    'starter kit': 9.99, 'starter commander deck': 44.99,
    'prerelease pack': 25.00, 'theme booster': 14.99,
    'collector booster pack': 29.99, 'play booster pack': 4.99, 'draft booster pack': 4.49,
    'secret lair': 39.99,
    'jumpstart booster box': 107.64,
    'play pack': 24.99, 'sleeved play booster': 5.99,
    'chocobo bundle': 274.99,
    'scene box': 59.99,
  },
  lorcana: {
    'booster box': 143.76, 'booster display': 143.76,
    'starter deck': 14.99, 'gift set': 44.99,
    'illumineer\'s trove': 49.99,
    'booster pack': 5.99,
  },
  weiss: {
    'booster box': 74.99, 'trial deck': 14.99,
    'booster pack': 3.75, 'supply set': 9.99,
  },
  yugioh: {
    'booster box': 95.76, 'structure deck': 9.99,
    'tin': 19.99, 'collector tin': 19.99,
    'special edition': 29.99, 'mega tin': 29.99,
    'booster pack': 3.99,
  },
  cardfight: {
    'booster box': 95.76, 'trial deck': 14.99,
    'special series': 29.99, 'premium collection': 99.99,
    'booster pack': 3.99,
  },
  digimon: {
    'booster box': 95.76, 'starter deck': 14.99,
    'booster pack': 3.99,
  },
  dragon_ball: {
    'booster box': 95.76, 'starter deck': 9.99,
    'booster pack': 4.00,
  },
  fab: {
    'booster box': 95.76, 'history pack': 9.99,
    'blitz deck': 9.99, 'classic constructed deck': 34.99,
    'booster pack': 4.00,
  },
  union_arena: {
    'booster box': 71.82, 'starter deck': 14.99,
    'booster pack': 2.99,
  },
  gundam: {
    'booster box': 71.82, 'starter deck': 14.99,
    'booster pack': 2.99,
  },
  star_wars: {
    'booster box': 143.76, 'starter deck': 14.99,
    'booster pack': 5.99,
  },
  hololive: {
    'booster box': 71.82, 'starter deck': 14.99,
    'booster pack': 2.99,
  },
  sorcery: {
    'booster box': 95.76, 'starter deck': 14.99,
    'booster pack': 4.00,
  },
  sports: {
    'hobby box': 299.99, 'blaster box': 29.99, 'mega box': 24.99,
    'hanger box': 19.99, 'fat pack': 14.99, 'value pack': 9.99,
    'cello pack': 19.99, 'jumbo box': 99.99,
  },
  disney_cards: {
    'hobby box': 249.99, 'blaster box': 29.99, 'mega box': 24.99,
    'hanger box': 19.99,
  },
};

function lookupMsrp(category, productName) {
  const cat = MSRP_TABLE[category?.toLowerCase()] ?? {};
  const name = productName.toLowerCase();
  // longest match wins (more specific)
  let best = null, bestLen = 0;
  for (const [keyword, msrp] of Object.entries(cat)) {
    if (name.includes(keyword) && keyword.length > bestLen) {
      best = { msrp, msrpSource: `table:${category}:${keyword}` };
      bestLen = keyword.length;
    }
  }
  return best;
}

// ── DBs to process ──────────────────────────────────────────────────────────────────────
const DB_CONFIGS = [
  { file: 'set-history.json',           category: 'pokemon' },
  { file: 'set-history-mtg.json',       category: 'mtg' },
  { file: 'set-history-one-piece.json', category: 'one_piece' },
  { file: 'set-history-lorcana.json',   category: 'lorcana' },
  { file: 'set-history-weiss.json',     category: 'weiss' },
  { file: 'set-history-union-arena.json',category: 'union_arena' },
  { file: 'set-history-gundam.json',    category: 'gundam' },
  { file: 'set-history-yugioh.json',    category: 'yugioh' },
  { file: 'set-history-cardfight.json', category: 'cardfight' },
  { file: 'set-history-dragon-ball.json',category: 'dragon_ball' },
  { file: 'set-history-fab.json',       category: 'fab' },
  { file: 'set-history-digimon.json',   category: 'digimon' },
  { file: 'set-history-sorcery.json',   category: 'sorcery' },
  { file: 'set-history-star-wars.json', category: 'star_wars' },
  { file: 'set-history-hololive.json',  category: 'hololive' },
  { file: 'set-history-sports.json',    category: 'sports' },
  { file: 'set-history-disney-cards.json', category: 'disney_cards' },
];

log(`[product-msrp] start ${new Date().toISOString()}`);
let grandTotal = 0, grandHit = 0, grandStockx = 0;

for (const { file, category } of DB_CONFIGS) {
  const fullPath = join(ROOT, file);
  if (!existsSync(fullPath)) continue;
  const db = JSON.parse(readFileSync(fullPath, 'utf8'));
  const sets = db.sets ?? db;

  let dbTotal = 0, dbHit = 0, dbStockx = 0;
  const stockxQueue = []; // {setKey, prodKey, prod} — deferred StockX lookups

  for (const [setKey, setRec] of Object.entries(sets)) {
    const prods = setRec.products ?? {};
    for (const [prodKey, prod] of Object.entries(prods)) {
      if (!prod || typeof prod !== 'object') continue;
      if (prod.msrp != null) continue; // already has MSRP
      dbTotal++;

      // Try lookup table first
      const name = prod.name ?? prodKey.replace(/-/g, ' ');
      const tableHit = lookupMsrp(category, name);
      if (tableHit) {
        prod.msrp = tableHit.msrp;
        prod.msrpSource = tableHit.msrpSource;
        dbHit++;
      } else if ((prod.market ?? 0) > 500) {
        stockxQueue.push({ setKey, prodKey, prod, name, setName: setRec.name ?? setKey });
      }
    }
  }

  log(`${file}: ${dbTotal} products, ${dbHit} table hits, ${stockxQueue.length} StockX queue`);

  // StockX pass for unmatched high-value items
  for (const { setName, prodKey, prod, name } of stockxQueue) {
    const query = `${setName} ${name}`.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    try {
      const r = await stockxMarket(query);
      if (r?.msrp && r.msrp > 0) {
        prod.msrp = r.msrp;
        prod.msrpSource = `stockx:${r.urlKey ?? 'search'}`;
        dbStockx++;
        log(`  SX ✓ ${name} → $${r.msrp}`);
      }
    } catch {}
    await sleep(3500); // StockX rate limit
  }

  dbHit += dbStockx;
  grandTotal += dbTotal; grandHit += dbHit; grandStockx += dbStockx;
  log(`  → ${dbHit}/${dbTotal} filled (${dbStockx} via StockX)`);

  // Save
  writeFileSync(fullPath, JSON.stringify(db, null, 2));
}

log(`\n[DONE] ${grandHit}/${grandTotal} sealed products have MSRP (${grandStockx} via StockX)`);
