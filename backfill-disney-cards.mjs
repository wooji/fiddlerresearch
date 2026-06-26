#!/usr/bin/env node
// Backfill Disney card sets: sealed prices (PriceCharting) + chase cards (eBay Playwright).
// Handles Topps Chrome Disney, Disney Wonder, Disneyland, Neon, Kakawow Cosmos/Phantom.
// PriceCharting covers Topps sets; Kakawow falls back to eBay scraping.
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { chromium } from 'playwright';
import { pcAllSealedTypes } from './lib/pricecharting.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT  = join(ROOT, 'set-history-disney-cards.json');
const LOG  = join(ROOT, 'backfill-disney-cards.log');
const PROXY_FILE = join(ROOT, 'proxies-mobilemix.txt');

const SEALED_TYPES = [
  'hobby-box','blaster-box','hanger-box','mega-box','jumbo-box',
  'retail-box','value-box','premium-box','collector-box','deluxe-box',
  'hobby-pack','blaster-pack','fat-pack','cello-pack',
];

// ── proxy ──────────────────────────────────────────────────────────────
let proxies = [];
if (existsSync(PROXY_FILE)) {
  proxies = readFileSync(PROXY_FILE, 'utf8').trim().split('\n')
    .map(l => l.trim()).filter(l => l.includes('mp.evomi.com'));
}
function randomProxy() {
  if (!proxies.length) return undefined;
  const [ip, port, user, pass] = proxies[Math.floor(Math.random() * proxies.length)].split(':');
  return { server: `http://${ip}:${port}`, username: user, password: pass };
}

// ── logging ────────────────────────────────────────────────────────────
const log = msg => { console.log(msg); appendFileSync(LOG, msg + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save  = db => { db._meta.updated = new Date().toISOString().slice(0,10); writeFileSync(OUT, JSON.stringify(db, null, 2)); };

// ── load DB ────────────────────────────────────────────────────────────
const db = JSON.parse(readFileSync(OUT, 'utf8'));
const sets = db.sets;

// ── build work queue: sets missing sealed products ─────────────────────
const TODO = Object.entries(sets).filter(([, v]) => !v.products || Object.keys(v.products).length === 0);
log(`[disney-backfill] ${TODO.length} sets need product data (${Object.keys(sets).length} total)`);

// ── Phase 1: PriceCharting sealed prices (Topps sets) ──────────────────
log('\n── Phase 1: PriceCharting sealed prices ──');
let pcHits = 0, pcMiss = 0;
for (const [slug, setRec] of TODO) {
  if (/kakawow/i.test(slug)) continue; // skip kakawow — not on PC
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const all = await pcAllSealedTypes(slug, SEALED_TYPES, browser);
    if (all.length) {
      const products = {};
      for (const r of all) products[r.type] = {
        current: r.current, currentMonth: r.currentMonth,
        ath: r.ath, athMonth: r.athMonth,
        first: r.first, firstMonth: r.firstMonth,
        months: r.points, url: r.url, series: r.series,
        source: 'pricecharting',
      };
      const deepest = all.reduce((a, r) => r.points > a.points ? r : a, all[0]);
      sets[slug].products = products;
      sets[slug].firstMonth = deepest.firstMonth;
      const summ = all.map(r => `${r.type}=$${r.current}`).join(' | ');
      log(`  ✓ ${slug} → ${summ}`);
      pcHits++;
    } else {
      log(`  · ${slug} (no PC sealed history)`);
      sets[slug].products = {};
      pcMiss++;
    }
  } catch (e) {
    log(`  ! ${slug}: ${e?.message?.slice(0,60)}`);
    sets[slug].products = {};
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  save(db);
  await sleep(400);
}
log(`Phase 1 done: ${pcHits} with data, ${pcMiss} empty`);

// ── Phase 2: eBay chase cards (all sets, Playwright + Evomi proxy) ──────
log('\n── Phase 2: eBay chase cards ──');

const CHAR_SKIP = /^(lot|bundle|case|box|pack|sealed|repack|break|relic|auto|patch|\d+\s+card)/i;

function buildEbayQuery(slug, setName) {
  // Insert sets within Chrome Disney → search the parent product + subset keyword
  // e.g. "2024-topps-chrome-disney-super-strength" → "2024 Topps Chrome Disney Super Strength"
  // Kakawow → "Kakawow Cosmos Disney [subset]"
  const isKakawow = /kakawow/i.test(slug);
  const year = slug.match(/^(\d{4})/)?.[1] ?? '';
  // Extract subset name (everything after main brand)
  let subset = setName
    .replace(/^\d{4}\s*/,'')
    .replace(/^(topps|kakawow)\s*/i,'')
    .replace(/^(chrome|cosmos|phantom)\s*/i,'')
    .replace(/^disney\s*/i,'').trim();
  if (!subset) subset = setName;
  if (isKakawow) return `Kakawow ${year} Disney ${subset}`.trim();
  return `${year} Topps Chrome Disney ${subset}`.trim();
}

async function scrapeEbayDisney(setName, slug, page) {
  const q = buildEbayQuery(slug, setName);
  const query = encodeURIComponent(q);
  await page.goto(
    `https://www.ebay.com/sch/i.html?_nkw=${query}&_sacat=0&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60`,
    { waitUntil: 'domcontentloaded', timeout: 25000 }
  ).catch(() => {});
  await new Promise(r => setTimeout(r, 1800));

  const items = await page.$$eval('li.s-item', els => els.map(el => {
    const title = el.querySelector('.s-item__title')?.textContent?.trim() ?? '';
    const priceStr = el.querySelector('.s-item__price')?.textContent?.trim() ?? '';
    const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    return { title, price };
  }));

  // filter: plausible single card price range $5–$5000, skip sealed/lot keywords
  const singles = items.filter(i =>
    i.price >= 5 && i.price <= 5000 &&
    !CHAR_SKIP.test(i.title) &&
    i.title.length > 10
  );

  // extract character names + prices, group by character
  const charMap = new Map();
  for (const { title, price } of singles) {
    // strip year + set name prefix to isolate character
    const cleaned = title
      .replace(/\d{4}\s+(topps|kakawow|panini)/gi, '')
      .replace(/chrome|disney|cosmos|phantom|wonder|neon|disneyland/gi, '')
      .replace(/#[\w-]+/g, '')
      .replace(/\b(psa|bgs|sgc|cgc)\s*\d+/gi, '')
      .replace(/\/(25|10|5|1|\d+)\b/g, '') // print run
      .replace(/\s+/g, ' ').trim();
    if (cleaned.length < 3) continue;
    // use first 2-3 words as character key
    const charKey = cleaned.split(' ').slice(0, 3).join(' ').toLowerCase();
    if (!charMap.has(charKey)) charMap.set(charKey, { name: cleaned.split(' ').slice(0,3).join(' '), prices: [], rawTitles: [] });
    const rec = charMap.get(charKey);
    rec.prices.push(price);
    rec.rawTitles.push(title);
  }

  // top 10 by median price
  const chars = [...charMap.values()]
    .filter(c => c.prices.length >= 1)
    .map(c => {
      const sorted = c.prices.slice().sort((a,b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return { name: c.name, market: Math.round(median * 100) / 100, count: c.prices.length, rawTitle: c.rawTitles[0] };
    })
    .sort((a, b) => b.market - a.market)
    .slice(0, 10);

  return chars;
}

let chaseHits = 0;
const TODO_CHASE = Object.entries(sets).filter(([, v]) => !v.cards?.chaseCards?.length);
log(`${TODO_CHASE.length} sets need chase card scrape`);

for (const [slug, setRec] of TODO_CHASE) {
  const setName = setRec.name || slug.replace(/-/g, ' ');
  const proxy = randomProxy();
  let browser, page;
  try {
    browser = await chromium.launch({ headless: true, proxy: proxy || undefined });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'en-US', viewport: { width: 1366, height: 900 },
      proxy: proxy || undefined,
    });
    page = await ctx.newPage();
    await page.goto('https://www.ebay.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 800));

    const chaseCards = await scrapeEbayDisney(setName, slug, page);
    if (chaseCards.length) {
      if (!setRec.cards) setRec.cards = {};
      setRec.cards.chaseCards = chaseCards;
      setRec.cards.topChase = chaseCards[0];
      setRec.cards.avgChasePrice = Math.round(chaseCards.reduce((a,c)=>a+c.market,0)/chaseCards.length);
      setRec.cards.fetchedAt = new Date().toISOString().slice(0,10);
      setRec.cards.source = 'ebay-sold-comps';
      log(`  ✓ ${slug} → ${chaseCards.length} chase cards, top: ${chaseCards[0].name} $${chaseCards[0].market}`);
      chaseHits++;
    } else {
      log(`  · ${slug} (0 eBay results)`);
      if (!setRec.cards) setRec.cards = {};
      setRec.cards.fetchedAt = new Date().toISOString().slice(0,10);
      setRec.cards.chaseCards = [];
    }
  } catch (e) {
    log(`  ! ${slug}: ${e?.message?.slice(0,80)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  save(db);
  await new Promise(r => setTimeout(r, 2000));
}

log(`\n[disney-backfill] DONE — Phase2: ${chaseHits}/${TODO_CHASE.length} sets with chase cards`);
log(`[disney-backfill] DB: ${Object.keys(sets).length} sets, ${Object.values(sets).filter(s=>Object.keys(s.products||{}).length>0).length} with products`);
