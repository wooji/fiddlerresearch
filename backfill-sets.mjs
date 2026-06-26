// Backfill historical sealed pricing for EVERY Pokemon set via PriceCharting.
// Writes set-history.json incrementally; logs every set's data as it goes.
// Usage: node backfill-sets.mjs [limit]
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { chromium } from 'playwright';
import { pcConsoleList, pcAllSealed } from './lib/pricecharting.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT  = join(ROOT, 'set-history.json');

// Never let a stray rejection kill the long crawl
process.on('unhandledRejection', e => console.error('[backfill] unhandledRejection:', e?.message));
process.on('uncaughtException',  e => console.error('[backfill] uncaughtException:', e?.message));
const limit = parseInt(process.argv[2] ?? '0', 10) || Infinity;

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { _meta: { source: 'pricecharting.com free product pages — chart_data.used (sealed), cents→USD', updated: null }, sets: {} };

const sets = await pcConsoleList();
console.log(`[backfill] ${sets.length} Pokemon sets found on PriceCharting\n`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const save  = () => { existing._meta.updated = new Date().toISOString().slice(0,10); writeFileSync(OUT, JSON.stringify(existing, null, 1)); };
let done = 0, withData = 0;
const queue = sets.slice(0, limit);

// Sequential, FRESH browser per set (leak-proof + stable), save after EVERY set,
// record empties too so restarts skip them. Survives any single-set failure.
for (const set of queue) {
  done++;
  if (existing.sets[set.slug]) continue;                          // resume: skip already-scanned (incl. empties)
  let all = [];
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    all = await pcAllSealed(set.slug, browser);
  } catch (e) { console.error(`[${done}/${sets.length}] ! ${set.name}: ${e?.message}`); }
  finally { if (browser) await browser.close().catch(() => {}); }

  if (all.length) {
    withData++;
    const products = {};
    for (const r of all) products[r.type] = {
      current: r.current, currentMonth: r.currentMonth,
      ath: r.ath, athMonth: r.athMonth,
      first: r.first, firstMonth: r.firstMonth,
      months: r.points, url: r.url, series: r.series,
    };
    const deepest = all.reduce((a, r) => r.points > a.points ? r : a, all[0]);
    existing.sets[set.slug] = { name: set.name, firstMonth: deepest.firstMonth, products };
    const summ = all.map(r => `${r.type.replace('booster-','').replace('elite-trainer-box','etb')}=$${r.current}/ATH$${r.ath}`).join(' ');
    const yrs = deepest.points >= 12 ? (deepest.points/12).toFixed(1)+'yr' : deepest.points+'mo';
    console.log(`[${done}/${sets.length}] ✓ ${set.name.padEnd(26)} [${yrs} from ${deepest.firstMonth}] ${summ}`);
  } else {
    existing.sets[set.slug] = { name: set.name, products: {} };   // mark scanned-empty
    console.log(`[${done}/${sets.length}] · ${set.name.padEnd(26)} (no sealed history)`);
  }
  save();                                                          // persist every set
  await sleep(300);
}
console.log(`\n[backfill] DONE — ${withData}/${sets.length} sets with sealed history → set-history.json`);
