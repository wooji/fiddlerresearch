/**
 * LEGO set history backfill — focus on top investment sets (retiring/recently retired).
 * Queries eBay sold for each set, updates current and ath fields in set-history-lego.json.
 * Uses months calculated from actual release date to today.
 *
 * Run: node backfill-lego.mjs
 * Optional: node backfill-lego.mjs --set 75192  (single set)
 * Optional: node backfill-lego.mjs --only-empty  (only sets with null current)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ebaySold } from './lib/deep-research.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const DB_PATH = join(ROOT, 'set-history-lego.json');

const args = process.argv.slice(2);
const targetSet = args.includes('--set') ? args[args.indexOf('--set') + 1] : null;
const onlyEmpty = args.includes('--only-empty');

const TODAY = new Date('2026-06-23');

function monthsAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = (TODAY - d) / (1000 * 60 * 60 * 24 * 30.44);
  return Math.round(diff * 10) / 10;
}

// Target LEGO investment sets with eBay queries
const TARGET_SETS = {
  '75192': {
    name: 'LEGO Millennium Falcon 75192 sealed new',
    retail: 849.99,
    releaseDate: '2017-10-01',
    query: 'LEGO Millennium Falcon 75192 sealed new',
  },
  '21350': {
    name: 'LEGO Jaws 21350 sealed new',
    retail: 149.99,
    releaseDate: '2025-05-01',
    query: 'LEGO Jaws 21350 sealed new',
  },
  '10295': {
    name: 'LEGO Porsche 911 10295 sealed new',
    retail: 169.99,
    releaseDate: '2021-03-01',
    query: 'LEGO Porsche 911 10295 sealed new',
  },
  '75313': {
    name: 'LEGO AT-AT 75313 sealed new',
    retail: 849.99,
    releaseDate: '2021-11-01',
    query: 'LEGO AT-AT 75313 sealed new',
  },
  '10307': {
    name: 'LEGO Eiffel Tower 10307 sealed new',
    retail: 629.99,
    releaseDate: '2022-11-01',
    query: 'LEGO Eiffel Tower 10307 sealed new',
  },
  '21323': {
    name: 'LEGO Grand Piano 21323 sealed new',
    retail: 349.99,
    releaseDate: '2020-10-01',
    query: 'LEGO Grand Piano 21323 sealed new',
  },
  '10294': {
    name: 'LEGO Titanic 10294 sealed new',
    retail: 679.99,
    releaseDate: '2021-11-01',
    query: 'LEGO Titanic 10294 sealed new',
  },
  '75252': {
    name: 'LEGO Imperial Star Destroyer 75252 sealed new',
    retail: 699.99,
    releaseDate: '2019-09-01',
    query: 'LEGO Imperial Star Destroyer 75252 sealed new',
  },
  '42083': {
    name: 'LEGO Bugatti Chiron Technic 42083 sealed',
    retail: 379.99,
    releaseDate: '2018-08-01',
    query: 'LEGO Bugatti Chiron Technic 42083 sealed',
  },
  '31150': {
    name: 'LEGO Creator 3-in-1 Tree House 31150 sealed new',
    retail: 249.99,
    releaseDate: '2024-08-01',
    query: 'LEGO Creator 3-in-1 Tree House 31150 sealed new',
  },
};

function log(msg) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`);
}

async function backfillSet(db, setNum) {
  const set = db.sets[setNum];
  if (!set) {
    log(`SKIP ${setNum} — not in DB`);
    return;
  }

  const target = TARGET_SETS[setNum];
  if (!target) {
    log(`SKIP ${setNum} — not in target list`);
    return;
  }

  const retail = target.retail;
  const months = monthsAgo(target.releaseDate);
  log(
    `Processing ${setNum} (${target.name}) — ${months} months old, retail $${retail}`
  );

  // ── eBay Sold (with retail floor = retail * 0.8 for sealed-new filter) ────
  let ebayData = null;
  try {
    // LEGO sealed-new: price floor retail * 0.8 to filter out loose/damaged
    const retailFloor = Math.round(retail * 0.8 * 100) / 100;
    ebayData = await ebaySold(target.query, { retailFloor });
    if (ebayData?.median) {
      log(
        `  eBay median: $${ebayData.median} | 30d count: ${ebayData.count30} | high: $${ebayData.high}`
      );
    } else {
      log(`  eBay: no sold data`);
    }
  } catch (e) {
    log(`  eBay error: ${e.message}`);
  }

  // ── Update DB ────────────────────────────────────────────────────────────
  let current = null;
  if (ebayData?.median30) current = ebayData.median30;
  else if (ebayData?.median) current = ebayData.median;

  // ATH: take max of existing vs eBay high
  const existingAth = set.valueNew ?? 0;
  const ebayHigh = ebayData?.high ?? 0;
  const ath = Math.max(existingAth, ebayHigh) || null;

  // Always set retail to our known value
  set.retail = retail;

  if (current != null) {
    set.current = Math.round(current);
    log(`  → current: $${set.current}`);
  }
  if (ath != null && ath > 0) {
    set.ath = Math.round(ath);
    log(`  → ath: $${set.ath}`);
  }

  log(`  → months: ${months}`);
}

async function main() {
  const db = JSON.parse(readFileSync(DB_PATH, 'utf8'));

  let sets = Object.keys(TARGET_SETS);

  if (targetSet) {
    sets = sets.filter((k) => k === targetSet);
    if (!sets.length) {
      log(`No matching set for: ${targetSet}`);
      process.exit(1);
    }
  }

  if (onlyEmpty) {
    sets = sets.filter((k) => !db.sets[k]?.current);
    log(`--only-empty: processing ${sets.length} sets with null current`);
  }

  log(`Backfill starting — ${sets.length} sets`);

  for (const setNum of sets) {
    await backfillSet(db, setNum);
    // Brief pause between sets to avoid eBay rate limiting
    await new Promise((r) => setTimeout(r, 3000));
  }

  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  log(`Done. DB saved to ${DB_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
