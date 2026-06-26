#!/usr/bin/env node
// Pokemon-only MSRP backfill pass — runs concurrently with disney backfill.
// Only processes set-history.json (pokemon). Skip already-filled products.
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stockxMarket } from './lib/stockx.mjs';
import { createRequire } from 'module';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LOG = join(ROOT, 'backfill-pokemon-msrp.log');
const log = msg => { console.log(msg); appendFileSync(LOG, msg + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Import MSRP table from main script (re-declare here with same values)
const MSRP_TABLE = {
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
  'prize pack': 9.99, 'energy prize pack': 9.99,
  'world championship deck': 14.99,
  'halfdeck': 9.99, 'half deck': 9.99,
  'first partner illustration collection': 29.99,
  'first partner collection': 29.99,
  'pencil case': 9.99, 'tool box': 34.99, 'pop series': 4.99,
  'code card': 0.00, 'mcdonald': 3.99, 'happy meal': 3.99,
  'iron bundle': 29.99,
  'league battle deck': 14.99, 'league deck': 14.99,
  'battle deck': 14.99, 'ex battle deck': 14.99,
  'trainer kit': 14.99, 'theme deck': 12.99,
  'elite trainer box plus': 59.99,
  'two player starter set': 29.99, 'starter set': 29.99,
  'collection tin': 19.99, 'lunchbox collection': 29.99,
  'backpack collection': 49.99, 'ball collection': 29.99,
};

function lookupMsrp(name) {
  const n = name.toLowerCase();
  let best = null, bestLen = 0;
  for (const [kw, msrp] of Object.entries(MSRP_TABLE)) {
    if (n.includes(kw) && kw.length > bestLen) {
      best = { msrp, msrpSource: `table:pokemon:${kw}:v2` };
      bestLen = kw.length;
    }
  }
  return best;
}

log(`[pokemon-msrp] start ${new Date().toISOString()}`);
const db = JSON.parse(readFileSync(join(ROOT, 'set-history.json'), 'utf8'));
const sets = db.sets;

let total = 0, hit = 0, sx = 0;
const sxQueue = [];

for (const [setKey, setRec] of Object.entries(sets)) {
  for (const [pk, pv] of Object.entries(setRec.products ?? {})) {
    if (!pv || typeof pv !== 'object') continue;
    if (pv.msrp != null) continue; // skip already filled
    total++;
    const name = pv.name ?? pk.replace(/-/g, ' ');
    const tableHit = lookupMsrp(name);
    if (tableHit) { pv.msrp = tableHit.msrp; pv.msrpSource = tableHit.msrpSource; hit++; }
    else if ((pv.market ?? 0) > 500) sxQueue.push({ setKey, pk, pv, name, setName: setRec.name ?? setKey });
  }
}

log(`table hits: ${hit}/${total}, StockX queue: ${sxQueue.length}`);

for (const { setName, name, pv } of sxQueue) {
  const query = `${setName} ${name}`.replace(/[_-]/g, ' ').slice(0, 80);
  try {
    const r = await stockxMarket(query);
    if (r?.msrp > 0) { pv.msrp = r.msrp; pv.msrpSource = `stockx:${r.urlKey ?? 'search'}`; sx++; log(`  SX ✓ ${name} → $${r.msrp}`); }
  } catch {}
  await sleep(3500);
}

writeFileSync(join(ROOT, 'set-history.json'), JSON.stringify(db, null, 2));
log(`[DONE] ${hit + sx}/${total} newly filled (${sx} StockX). Total in DB: ${hit + sx}`);
