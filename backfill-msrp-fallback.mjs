/**
 * MSRP fallback pass — fills `retail` for sets StockX could not match (backfill-msrp.mjs leaves
 * them null). Uses category + ERA defaults for STANDARDIZED modern sealed MSRPs only.
 * Transparent: sets retailSource='category-default (<era>)' and retailVerified=false so it is
 * NEVER mistaken for a StockX-verified price. Vintage / non-standard / sports left null (no guess).
 *
 * Run:  node backfill-msrp-fallback.mjs            (all DBs)
 *       node backfill-msrp-fallback.mjs --db set-history.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const ONLY_DB = args.includes('--db') ? args[args.indexOf('--db') + 1] : null;

// Modern-era standardized booster-box MSRPs (English). Pre-2020 left null (MSRP too variable).
const yearOf = v => { const m = String(v.releaseDate ?? v.firstMonth ?? '').match(/(\d{4})/); return m ? +m[1] : null; };
const DEFAULTS = {
  'set-history.json':            { label: 'Pokemon',   minYear: 2020, boosterBox: 143.64, etb: 49.99 },     // modern EN booster box $3.99×36
  'set-history-mtg.json':        { label: 'MTG',       minYear: 2021, boosterBox: 144.00 },                 // play booster box ~$144 modern
  'set-history-lorcana.json':    { label: 'Lorcana',   minYear: 2023, boosterBox: 144.00 },                 // $5.99×24 ≈ $144
  'set-history-other-tcg.json':  { label: 'Other-TCG', minYear: 2022, boosterBox: 100.00 },                 // generic modern TCG box
  'set-history-one-piece.json':  { label: 'One Piece', minYear: 2022, boosterBox: 100.00 },                 // EN OP box (already mostly filled)
  // sports + noncard: NO standard MSRP → no fallback, leave null
};

const DBS = ONLY_DB ? [ONLY_DB] : Object.keys(DEFAULTS);
let grandFilled = 0;

for (const dbFile of DBS) {
  const cfg = DEFAULTS[dbFile]; if (!cfg) { console.log(`skip ${dbFile} (no standard MSRP)`); continue; }
  const path = join(ROOT, dbFile); if (!existsSync(path)) continue;
  const db = JSON.parse(readFileSync(path, 'utf8'));
  const sets = db.sets ?? db;
  let filled = 0, skipped = 0;
  for (const [k, v] of Object.entries(sets)) {
    if (v.retail != null) continue;
    const yr = yearOf(v);
    // Only fill modern era + skip obvious non-box products (promo/deck/tin/collection/single)
    const nm = (v.name ?? k).toLowerCase();
    if (yr == null || yr < cfg.minYear || /promo|deck|tin|collection|single|pack only|theme/.test(nm)) { skipped++; continue; }
    v.retail = cfg.boosterBox;
    v.retailVerified = false;
    v.retailSource = `category-default (${cfg.label} modern booster box, ${yr})`;
    filled++;
  }
  writeFileSync(path, JSON.stringify(db, null, 1));
  grandFilled += filled;
  console.log(`${dbFile.padEnd(30)} fallback-filled ${filled} | left null ${skipped}`);
}
console.log(`\nFALLBACK DONE — ${grandFilled} sets filled with category-default MSRP (flagged unverified)`);
