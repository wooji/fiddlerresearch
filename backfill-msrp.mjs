/**
 * MSRP backfill — populates `retail` (verified MSRP) for every set across all category DBs.
 * Source: StockX productAttributes.retailPrice (the authoritative MSRP per prior lessons).
 * NEVER guesses — leaves retail null if StockX has no clean (non-lot/non-JP) match.
 *
 * Run:   node backfill-msrp.mjs              (all DBs, only sets missing retail)
 *        node backfill-msrp.mjs --db set-history.json
 *        node backfill-msrp.mjs --all        (re-check even sets that already have retail)
 * Sequential + throttled (StockX rate-limit safe). Writes status to backfill-msrp-status.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stockxMarket } from './lib/stockx.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const ONLY_DB = args.includes('--db') ? args[args.indexOf('--db') + 1] : null;
const REDO = args.includes('--all');

const DBS = ONLY_DB ? [ONLY_DB] : [
  'set-history.json', 'set-history-one-piece.json', 'set-history-mtg.json',
  'set-history-lorcana.json', 'set-history-sports.json', 'set-history-other-tcg.json',
  'set-history-noncard.json',
]; // LEGO already 94% via brickeconomy — skip unless --db

// Build a StockX query from a set record. "<name> Booster Box" works for TCG; sports use label.
const buildQuery = (v, dbFile) => {
  const name = v.name ?? v.label ?? v.id ?? '';
  if (/lego/.test(dbFile)) return `LEGO ${v.setNum ?? name}`;
  if (/sports/.test(dbFile)) return `${name} Hobby Box`;
  return `${name} Booster Box`;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const status = { startedAt: null, dbs: {} };
const writeStatus = () => { try { writeFileSync(join(ROOT, 'backfill-msrp-status.json'), JSON.stringify(status, null, 1)); } catch {} };

for (const dbFile of DBS) {
  const path = join(ROOT, dbFile);
  if (!existsSync(path)) { console.log(`skip ${dbFile} (missing)`); continue; }
  const db = JSON.parse(readFileSync(path, 'utf8'));
  const sets = db.sets ?? db;
  const keys = Object.keys(sets);
  const todo = keys.filter(k => REDO || sets[k].retail == null);
  status.dbs[dbFile] = { total: keys.length, todo: todo.length, filled: 0, done: false };
  writeStatus();
  console.log(`\n=== ${dbFile}: ${todo.length}/${keys.length} need MSRP ===`);

  let filled = 0;
  for (let i = 0; i < todo.length; i++) {
    const k = todo[i]; const v = sets[k];
    const q = buildQuery(v, dbFile);
    let r = null;
    try { r = await stockxMarket(q); } catch {}
    if (r?.msrp && r.msrp > 0) {
      v.retail = r.msrp;
      v.retailSource = `StockX MSRP (${r.urlKey ?? 'stockx'})`;
      filled++;
      console.log(`  [${i + 1}/${todo.length}] ${v.name ?? k} → $${r.msrp}`);
    } else {
      console.log(`  [${i + 1}/${todo.length}] ${v.name ?? k} → no clean StockX match`);
    }
    status.dbs[dbFile].filled = filled;
    if (i % 10 === 0) { writeFileSync(path, JSON.stringify(db, null, 1)); writeStatus(); }
    await sleep(1500); // throttle — StockX rate-limit safe (429 at 400ms)
  }
  writeFileSync(path, JSON.stringify(db, null, 1));
  status.dbs[dbFile].done = true; writeStatus();
  console.log(`=== ${dbFile} DONE: ${filled}/${todo.length} filled ===`);
}
console.log('\nALL MSRP BACKFILL COMPLETE');
writeStatus();
