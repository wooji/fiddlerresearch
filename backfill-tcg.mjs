// Generic sealed-pricing backfill for non-Pokemon DBs via PriceCharting.
// Usage: node backfill-tcg.mjs <mtg|lorcana|other-tcg|sports> [limit]
// Writes set-history-<db>.json incrementally (resume-safe), one entry per set.
// Pokemon stays in its own set-history.json (golden bible) — untouched.
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { chromium } from 'playwright';
import { pcConsoleListBy, pcAllSealedTypes, SEALED_TYPES_BY } from './lib/pricecharting.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

// Per-DB config: which category index(es) to enumerate + which slugs qualify.
const DBS = {
  mtg: {
    label: 'Magic: The Gathering',
    sources: [{ cat: 'magic-cards', re: /^magic-/, strip: /^magic-/ }],
    types: SEALED_TYPES_BY.mtg,
  },
  lorcana: {
    label: 'Disney Lorcana',
    sources: [{ cat: 'lorcana-cards', re: /^lorcana-/, strip: /^lorcana-/ }],
    types: SEALED_TYPES_BY.lorcana,
  },
  'other-tcg': {
    label: 'Other TCG (Dragon Ball, Riftbound, Gundam, Sorcery, …)',
    sources: [
      { cat: 'dragon-ball-cards', re: /^dragon-ball-/, strip: null },
      { cat: 'other-tcg-cards',   re: /^(riftbound|gundam|sorcery-contested|vcard|wonders-of|vibes)-/, strip: null },
    ],
    types: SEALED_TYPES_BY['other-tcg'],
  },
  sports: {
    label: 'Sports (Topps, Panini, Bowman, Hoops, Fleer, Upper Deck, …)',
    sources: [
      { cat: 'other-cards', re: /^\d{4}-(topps|panini|fleer|upper-deck|donruss|bowman|score|leaf|hoops|prizm|select|mosaic|optic|rittenhouse|sage|wild-card|kakawow|netpro|sage)/, strip: null },
    ],
    types: SEALED_TYPES_BY.sports,
  },
};

const dbKey = process.argv[2];
const cfg = DBS[dbKey];
if (!cfg) { console.error(`Usage: node backfill-tcg.mjs <${Object.keys(DBS).join('|')}> [limit]`); process.exit(1); }
const limit = parseInt(process.argv[3] ?? '0', 10) || Infinity;
const OUT = join(ROOT, `set-history-${dbKey}.json`);

process.on('unhandledRejection', e => console.error('[backfill] unhandledRejection:', e?.message));
process.on('uncaughtException',  e => console.error('[backfill] uncaughtException:', e?.message));

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8'))
  : { _meta: { db: dbKey, label: cfg.label, source: 'pricecharting.com free product pages — chart_data.used (sealed), cents→USD', updated: null }, sets: {} };

// Enumerate + dedupe sets across all configured category sources.
const seen = new Set(), sets = [];
for (const src of cfg.sources) {
  const found = await pcConsoleListBy(src.cat, src.re, src.strip);
  for (const s of found) if (!seen.has(s.slug)) { seen.add(s.slug); sets.push(s); }
  console.log(`[backfill] ${src.cat}: ${found.length} slugs`);
}
console.log(`[backfill] ${dbKey}: ${sets.length} unique sets to scan\n`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const save  = () => { existing._meta.updated = new Date().toISOString().slice(0, 10); writeFileSync(OUT, JSON.stringify(existing, null, 1)); };
let done = 0, withData = 0;
const queue = sets.slice(0, limit);

for (const set of queue) {
  done++;
  if (existing.sets[set.slug]) continue;                       // resume: skip scanned (incl. empties)
  let all = [], browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    all = await pcAllSealedTypes(set.slug, cfg.types, browser);
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
    const summ = all.map(r => `${r.type.replace('-box', '')}=$${r.current}/ATH$${r.ath}`).join(' ');
    const yrs = deepest.points >= 12 ? (deepest.points / 12).toFixed(1) + 'yr' : deepest.points + 'mo';
    console.log(`[${done}/${sets.length}] ✓ ${set.name.padEnd(28)} [${yrs} from ${deepest.firstMonth}] ${summ}`);
  } else {
    existing.sets[set.slug] = { name: set.name, products: {} };
    console.log(`[${done}/${sets.length}] · ${set.name.padEnd(28)} (no sealed history)`);
  }
  save();
  await sleep(300);
}
console.log(`\n[backfill] DONE — ${withData}/${sets.length} ${dbKey} sets with sealed history → set-history-${dbKey}.json`);
