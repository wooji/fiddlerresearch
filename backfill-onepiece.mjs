/**
 * One Piece TCG set history backfill — OP01-OP13.
 * Queries eBay sold + StockX for each set, updates set-history-one-piece.json.
 * Uses months calculated from actual release date to today.
 *
 * Run: node backfill-onepiece.mjs
 * Optional: node backfill-onepiece.mjs --set op11  (single set)
 * Optional: node backfill-onepiece.mjs --only-empty  (only sets with null current)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ebaySold } from './lib/deep-research.mjs';
import { stockxMarket } from './lib/stockx.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const DB_PATH = join(ROOT, 'set-history-one-piece.json');

const args = process.argv.slice(2);
const targetSet = args.includes('--set') ? args[args.indexOf('--set') + 1] : null;
const onlyEmpty = args.includes('--only-empty');

const TODAY = new Date('2026-06-23');

function monthsAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = (TODAY - d) / (1000 * 60 * 60 * 24 * 30.44);
  return Math.round(diff * 10) / 10;
}

// eBay query for each set — specific enough to avoid singles/wrong SKU
const EBAY_QUERIES = {
  'one-piece-op01': 'one piece romance dawn OP01 booster box sealed',
  'one-piece-op02': 'one piece paramount war OP02 booster box sealed',
  'one-piece-op03': 'one piece pillars of strength OP03 booster box sealed',
  'one-piece-op04': 'one piece kingdoms of intrigue OP04 booster box sealed',
  'one-piece-op05': 'one piece awakening new era OP05 booster box sealed',
  'one-piece-op06': 'one piece wings of the captain OP06 booster box sealed',
  'one-piece-op07': 'one piece 500 years future OP07 booster box sealed',
  'one-piece-op08': 'one piece two legends OP08 booster box sealed',
  'one-piece-op09': 'one piece four emperors OP09 booster box sealed',
  'one-piece-op10': 'one piece royal blood OP10 booster box sealed',
  'one-piece-op11': 'one piece emperors new world OP11 booster box sealed',
  'one-piece-op12': 'one piece wings of the pirates OP12 booster box sealed',
  'one-piece-op13': 'one piece carrying on his will OP13 booster box sealed',
};

const STOCKX_QUERIES = {
  'one-piece-op01': 'One Piece OP01 Romance Dawn Booster Box',
  'one-piece-op02': 'One Piece OP02 Paramount War Booster Box',
  'one-piece-op03': 'One Piece OP03 Pillars of Strength Booster Box',
  'one-piece-op04': 'One Piece OP04 Kingdoms of Intrigue Booster Box',
  'one-piece-op05': 'One Piece OP05 Awakening New Era Booster Box',
  'one-piece-op06': 'One Piece OP06 Wings of the Captain Booster Box',
  'one-piece-op07': 'One Piece OP07 500 Years Booster Box',
  'one-piece-op08': 'One Piece OP08 Two Legends Booster Box',
  'one-piece-op09': 'One Piece OP09 Four Emperors Booster Box',
  'one-piece-op10': 'One Piece OP10 Royal Blood Booster Box',
  'one-piece-op11': 'One Piece OP11 Emperors New World Booster Box',
  'one-piece-op12': 'One Piece OP12 Wings Pirates Booster Box',
  'one-piece-op13': 'One Piece OP13 Carrying On His Will Booster Box',
};

function log(msg) { process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${msg}\n`); }

async function backfillSet(db, setKey) {
  const set = db.sets[setKey];
  if (!set) { log(`SKIP ${setKey} — not in DB`); return; }

  const box = set.products?.['booster-box'];
  if (!box) { log(`SKIP ${setKey} — no booster-box product`); return; }

  const retail = set.retail ?? 72;
  const months = monthsAgo(set.releaseDate);
  log(`Processing ${setKey} (${set.name}) — ${months} months old, retail $${retail}`);

  // ── StockX ──────────────────────────────────────────────────────────────
  let stockxData = null;
  try {
    stockxData = await stockxMarket(STOCKX_QUERIES[setKey], { allowMsrp: true });
    if (stockxData?.last) log(`  StockX last sale: $${stockxData.last} | MSRP: $${stockxData.msrp ?? 'n/a'}`);
    else log(`  StockX: no data`);
  } catch (e) { log(`  StockX error: ${e.message}`); }

  // ── eBay Sold ────────────────────────────────────────────────────────────
  let ebayData = null;
  try {
    ebayData = await ebaySold(EBAY_QUERIES[setKey], { retailFloor: retail });
    if (ebayData?.median) {
      log(`  eBay median: $${ebayData.median} | 30d count: ${ebayData.count30} | high: $${ebayData.high}`);
    } else {
      log(`  eBay: no sold data`);
    }
  } catch (e) { log(`  eBay error: ${e.message}`); }

  // ── Update DB ────────────────────────────────────────────────────────────
  let current = null;
  // Prefer eBay 30d median (real recent solds) over StockX (which may lag)
  if (ebayData?.median30) current = ebayData.median30;
  else if (ebayData?.median) current = ebayData.median;
  else if (stockxData?.last) current = stockxData.last;

  // ATH: take max of existing vs eBay high vs StockX ask
  const existingAth = box.ath ?? 0;
  const candidates = [existingAth, ebayData?.high ?? 0, stockxData?.ask ?? 0].filter(Boolean);
  const ath = candidates.length ? Math.max(...candidates) : null;

  // Update retail if StockX MSRP found and current retail looks wrong
  let updatedRetail = retail;
  if (stockxData?.msrp && Math.abs(stockxData.msrp - retail) > 5) {
    log(`  Retail update: $${retail} → $${stockxData.msrp} (StockX MSRP)`);
    updatedRetail = stockxData.msrp;
    set.retail = updatedRetail;
    set.retailVerified = true;
    set.retailSource = 'StockX MSRP';
  }

  box.months = months;
  if (current != null) box.current = Math.round(current);
  if (ath != null && ath > 0) box.ath = Math.round(ath);

  log(`  → updated: current=$${box.current ?? 'n/a'} ath=$${box.ath ?? 'n/a'} months=${box.months}`);
}

async function main() {
  const db = JSON.parse(readFileSync(DB_PATH, 'utf8'));

  let sets = Object.keys(db.sets);

  if (targetSet) {
    const key = `one-piece-${targetSet.toLowerCase().replace(/^op/, 'op')}`;
    sets = sets.filter(k => k === key || k === targetSet);
    if (!sets.length) { log(`No matching set for: ${targetSet}`); process.exit(1); }
  }

  if (onlyEmpty) {
    sets = sets.filter(k => {
      const box = db.sets[k]?.products?.['booster-box'];
      return !box?.current;
    });
    log(`--only-empty: processing ${sets.length} sets with null current`);
  }

  log(`Backfill starting — ${sets.length} sets`);

  for (const setKey of sets) {
    await backfillSet(db, setKey);
    // Brief pause between sets to avoid eBay rate limiting
    await new Promise(r => setTimeout(r, 3000));
  }

  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  log(`Done. DB saved to ${DB_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
