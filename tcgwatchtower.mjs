// Enrich the Pokemon golden-bible DB (set-history.json) with CURRENT sealed prices
// from tcgwatchtower.com (clean source, TCGplayer-priced, modern SV+ME sets).
// For each set in /sets.json: render its sealed-product page, capture the
// /api/tcgplayer-prices?groupId= call, scrape the rendered sealed rows, and merge
// a `tcgwatchtower` block into the matching set-history entry (add, never overwrite history).
// Usage: node tcgwatchtower.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const DB = './set-history.json';
const db = existsSync(DB) ? JSON.parse(readFileSync(DB, 'utf8')) : { _meta: {}, sets: {} };
db._meta.tcgwatchtowerUpdated = '2026-06-20';

const norm = s => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(card list|sealed|product|the|pokemon|tcg)\b/g, '').replace(/\s+/g, ' ').trim();
const seriesSlug = s => (s ?? '').toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const setSlug    = s => (s ?? '').replace(/-card-list$/, '');

// Build name→key index of existing DB entries for fuzzy matching.
const dbIndex = Object.entries(db.sets).map(([key, v]) => ({ key, n: norm(v.name || key) }));
const findKey = name => { const n = norm(name); return dbIndex.find(e => e.n === n || e.n.includes(n) || n.includes(e.n))?.key ?? null; };

const sets = await (await fetch('https://tcgwatchtower.com/sets.json')).json();
console.log(`[tcgwt] ${sets.length} modern sets from sets.json\n`);

// Build the sealed-product URL. slug is inconsistent: some are clean ("paldea-evolved-card-list"),
// others are a full path ("pokemon/sets/mega-evolution/pitch-black/cards").
const sealedUrl = s => {
  if (s.slug.includes('/')) return `https://tcgwatchtower.com/${s.slug.replace(/\/cards$/, '')}/sealed-product`;
  return `https://tcgwatchtower.com/pokemon/sets/${seriesSlug(s.series)}/${setSlug(s.slug)}/sealed-product`;
};

const browser = await chromium.launch({ headless: true });
let merged = 0, added = 0, miss = 0;
for (const s of sets) {
  if (/one[\s-]?piece/i.test(s.series) || /^(OP|EB)\d/i.test(s.short)) continue;   // Pokemon DB only
  const url = sealedUrl(s);
  const page = await browser.newContext().then(c => c.newPage());
  let groupId = null;
  page.on('request', r => { const m = r.url().match(/tcgplayer-prices\?groupId=(\d+)/); if (m) groupId = m[1]; });
  try {
    const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    if (!r || r.status() >= 400) { console.error(`  · ${s.short} ${s.name} — page ${r?.status()} (${url})`); miss++; continue; }
    await page.waitForTimeout(1200);
    // scrape sealed rows: "<TYPE> <name> $<price> Amazon..." → {type,price}
    const rows = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('tr, [class*=row], [class*=product], li').forEach(el => {
        const t = el.innerText?.replace(/\s+/g, ' ').trim();
        const m = t && t.match(/^(BOOSTER BOX|BOOSTER BUNDLE|ELITE TRAINER BOX|BUILD & BATTLE BOX|BOOSTER PACK|BLISTER|COLLECTION|CASE)\b.*?\$([\d,]+\.\d{2})/i);
        if (m) out.push({ type: m[1].toUpperCase(), price: +m[2].replace(/,/g, '') });
      });
      return out;
    });
    if (!rows.length) { console.error(`  · ${s.short} ${s.name} — no sealed rows`); miss++; continue; }
    const TYPEMAP = { 'BOOSTER BOX': 'boosterBox', 'BOOSTER BUNDLE': 'bundle', 'ELITE TRAINER BOX': 'etb', 'BUILD & BATTLE BOX': 'buildBattle', 'BOOSTER PACK': 'pack', 'CASE': 'case' };
    const current = {};
    for (const row of rows) { const k = TYPEMAP[row.type]; if (k && !current[k]) current[k] = row.price; }
    const block = { source: 'tcgwatchtower (TCGplayer live)', groupId, setId: s.setId, current, updated: '2026-06-20' };

    let key = findKey(s.name);
    if (key) { db.sets[key].tcgwatchtower = block; merged++; }
    else { key = `tcgwt-${s.setId}`; db.sets[key] = { name: s.name, series: s.series, short: s.short, products: {}, tcgwatchtower: block }; added++; }
    const summ = Object.entries(current).map(([k, v]) => `${k}=$${v}`).join(' ');
    console.log(`  ✓ ${s.short.padEnd(6)} ${s.name.slice(0, 32).padEnd(32)} → ${key.padEnd(28)} ${summ}`);
  } catch (e) { console.error(`  ! ${s.short} ${s.name}: ${e.message}`); miss++; }
  finally { await page.close().catch(() => {}); }
}
await browser.close();
writeFileSync(DB, JSON.stringify(db, null, 1) + '\n');
console.log(`\n[tcgwt] DONE — ${merged} merged into existing, ${added} added new, ${miss} missed → set-history.json`);
