#!/usr/bin/env node
// Backfill Disney card sets: sealed prices (PriceCharting) + chase cards (eBay) + MSRP.
// Uses full exhaustion scraping order from lib/exhaustive-fetch.mjs.
// Phase 0: MSRP via SP-API Amazon + Topps Shopify
// Phase 1: PriceCharting sealed prices (Topps sets)
// Phase 2: eBay chase cards — CDP real browser first, then headed Playwright + all proxies
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { chromium } from 'playwright';
import { pcAllSealedTypes } from './lib/pricecharting.mjs';
import { exhaustivePlaywright, exhaustiveFetch, getCdpBrowser, toppsShopifyProducts } from './lib/exhaustive-fetch.mjs';
import { amazonListings } from './lib/deep-research.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT  = join(ROOT, 'set-history-disney-cards.json');
const LOG  = join(ROOT, 'backfill-disney-cards.log');

const SEALED_TYPES = [
  'hobby-box','blaster-box','hanger-box','mega-box','jumbo-box',
  'retail-box','value-box','premium-box','collector-box','deluxe-box',
  'hobby-pack','blaster-pack','fat-pack','cello-pack',
];

// Known Topps Shopify collection handles for Disney products
const TOPPS_DISNEY_COLLECTIONS = [
  'disney','disney-cards','topps-chrome-disney','disney-trading-cards',
  'disney-collection','chrome-disney',
];

// Fallback MSRP table for Disney sealed products (Topps retail prices)
const MSRP_TABLE = {
  'hobby-box': 149.99, 'collector-box': 149.99,
  'blaster-box': 24.99, 'mega-box': 49.99,
  'retail-box': 24.99, 'value-box': 19.99,
  'hobby-pack': 14.99, 'blaster-pack': 4.99,
  'fat-pack': 19.99, 'cello-pack': 9.99,
};

// ── logging ────────────────────────────────────────────────────────────
const log = msg => { console.log(msg); appendFileSync(LOG, msg + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save  = db => { db._meta.updated = new Date().toISOString().slice(0,10); writeFileSync(OUT, JSON.stringify(db, null, 2)); };

// ── load DB ────────────────────────────────────────────────────────────
const db = JSON.parse(readFileSync(OUT, 'utf8'));
const sets = db.sets;

// ── Phase 0: MSRP via table + SP-API ────────────────────────────────────────
// Topps.com blocks ALL proxies (CF Bot Management) — skip Shopify, go straight to table+SP-API
log('\n── Phase 0: MSRP enrichment (table + SP-API) ──');
const toppsMap = new Map(); // empty — Topps always blocks

// For each set with products, fill MSRP
const withProducts = Object.entries(sets).filter(([,s]) => s.products && Object.keys(s.products).length);
log(`${withProducts.length} sets have product data — filling MSRP`);

for (const [slug, setRec] of withProducts) {
  if (!setRec.products) continue;
  let changed = false;
  for (const [type, prodRec] of Object.entries(setRec.products)) {
    if (prodRec.msrp != null) continue;
    // Try Topps Shopify map
    const searchTitle = `${setRec.name || slug} ${type}`.toLowerCase();
    for (const [key, price] of toppsMap) {
      if (key.includes(slug.slice(0,15)) || searchTitle.includes(key.slice(0,10))) {
        prodRec.msrp = price; prodRec.msrpSource = 'topps-shopify'; changed = true; break;
      }
    }
    if (prodRec.msrp != null) continue;
    // Try SP-API Amazon
    const query = `${setRec.name || slug.replace(/-/g,' ')} ${type.replace(/-/g,' ')} trading cards`;
    try {
      const amz = await amazonListings(query, { limit: 3 });
      if (amz?.msrp) { prodRec.msrp = amz.msrp; prodRec.msrpSource = 'amazon-sp-api'; changed = true; }
      else if (amz?.price && amz.price > 10) { prodRec.msrp = amz.price; prodRec.msrpSource = 'amazon-sp-api:price'; changed = true; }
    } catch (e) { /* SP-API unavailable */ }
    if (prodRec.msrp != null) continue;
    // Fallback: table
    if (MSRP_TABLE[type]) { prodRec.msrp = MSRP_TABLE[type]; prodRec.msrpSource = 'table:disney'; changed = true; }
  }
  if (changed) { log(`  ✓ MSRP filled: ${slug}`); save(db); }
}

// ── Phase 1: PriceCharting sealed prices (Topps sets) ──────────────────
log('\n── Phase 1: PriceCharting sealed prices ──');
const TODO_PC = Object.entries(sets).filter(([slug, v]) =>
  !v.products || Object.keys(v.products).length === 0
);
log(`${TODO_PC.length} sets need product data`);
let pcHits = 0, pcMiss = 0;

for (const [slug, setRec] of TODO_PC) {
  if (/kakawow/i.test(slug)) continue;
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const all = await pcAllSealedTypes(slug, SEALED_TYPES, browser);
    if (all.length) {
      const products = {};
      for (const r of all) {
        products[r.type] = {
          current: r.current, currentMonth: r.currentMonth,
          ath: r.ath, athMonth: r.athMonth,
          first: r.first, firstMonth: r.firstMonth,
          months: r.points, url: r.url, series: r.series,
          source: 'pricecharting',
          msrp: MSRP_TABLE[r.type] ?? null,
          msrpSource: MSRP_TABLE[r.type] ? 'table:disney' : null,
        };
      }
      const deepest = all.reduce((a, r) => r.points > a.points ? r : a, all[0]);
      setRec.products = products;
      setRec.firstMonth = deepest.firstMonth;
      log(`  ✓ ${slug} → ${all.map(r=>`${r.type}=$${r.current}`).join(' | ')}`);
      pcHits++;
    } else {
      log(`  · ${slug} (no PC sealed history)`);
      setRec.products = {};
      pcMiss++;
    }
  } catch (e) {
    log(`  ! ${slug}: ${e?.message?.slice(0,60)}`);
    setRec.products = {};
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  save(db);
  await sleep(400);
}
log(`Phase 1 done: ${pcHits} with data, ${pcMiss} empty`);

// ── Phase 2: eBay chase cards — full exhaustion sequence ──────────────────
log('\n── Phase 2: eBay chase cards (full exhaustion) ──');

const CHAR_SKIP = /^(lot|bundle|case|box|pack|sealed|repack|break|relic|auto|patch|\d+\s+card)/i;

function buildEbayQuery(slug, setName) {
  const isKakawow = /kakawow/i.test(slug);
  const year = slug.match(/^(\d{4})/)?.[1] ?? '';
  let subset = setName
    .replace(/^\d{4}\s*/,'')
    .replace(/^(topps|kakawow)\s*/i,'')
    .replace(/^(chrome|cosmos|phantom)\s*/i,'')
    .replace(/^disney\s*/i,'').trim();
  if (!subset) subset = setName;
  if (isKakawow) return `Kakawow ${year} Disney ${subset}`.trim();
  return `${year} Topps Chrome Disney ${subset}`.trim();
}

// Build multiple query variants for retry
function buildQueryVariants(slug, setName) {
  const base = buildEbayQuery(slug, setName);
  const isKakawow = /kakawow/i.test(slug);
  const year = slug.match(/^(\d{4})/)?.[1] ?? '';
  return [
    base,
    isKakawow ? `Kakawow Disney ${year}` : `${year} Topps Chrome Disney`,
    isKakawow ? `Kakawow Disney 2025 cosmos` : `Topps Chrome Disney card`,
    `Disney trading card ${year}`,
  ].filter((q, i, a) => a.indexOf(q) === i); // dedupe
}

async function scrapeEbayDisney(setName, slug, page) {
  const queries = buildQueryVariants(slug, setName);
  let singles = [];

  for (const q of queries) {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(1500);

    await page.waitForSelector('.s-card, li.s-item', { timeout: 8000 }).catch(() => {});
    const items = await page.$$eval('.s-card, li.s-item', els => els.map(el => {
      const titleEl = el.querySelector('[class*="title"], h3, .s-item__title') ?? el.querySelector('a');
      const title = (titleEl?.textContent?.trim() ?? '').replace(/Opens in a new window or tab\.?/gi,'').replace(/View similar.*|Sell one.*/gi,'').trim();
      const priceEl = el.querySelector('[class*="s-card__price"], .s-item__price, [class*="price"]');
      const price = parseFloat(((priceEl?.textContent?.trim() ?? '0').match(/[\d,]+\.?\d*/)?.[0] ?? '0').replace(/,/g,''));
      return { title, price };
    }).filter(i => i.title && i.title !== 'Shop on eBay')).catch(() => []);

    singles = items.filter(i =>
      i.price >= 5 && i.price <= 5000 &&
      !CHAR_SKIP.test(i.title) &&
      i.title.length > 10
    );

    if (singles.length >= 5) break; // got enough results
    log(`    [retry] query "${q}" → ${singles.length} items, trying next variant`);
  }

  if (!singles.length) return [];

  // extract character names + prices, group by character
  const charMap = new Map();
  for (const { title, price } of singles) {
    const cleaned = title
      .replace(/\d{4}\s+(topps|kakawow|panini)/gi, '')
      .replace(/chrome|disney|cosmos|phantom|wonder|neon|disneyland/gi, '')
      .replace(/#[\w-]+/g, '')
      .replace(/\b(psa|bgs|sgc|cgc)\s*\d+/gi, '')
      .replace(/\/(25|10|5|1|\d+)\b/g, '')
      .replace(/\s+/g, ' ').trim();
    if (cleaned.length < 3) continue;
    const charKey = cleaned.split(' ').slice(0, 3).join(' ').toLowerCase();
    if (!charMap.has(charKey)) charMap.set(charKey, { name: cleaned.split(' ').slice(0,3).join(' '), prices: [], rawTitles: [] });
    const rec = charMap.get(charKey);
    rec.prices.push(price);
    rec.rawTitles.push(title);
  }

  return [...charMap.values()]
    .filter(c => c.prices.length >= 1)
    .map(c => {
      const sorted = c.prices.slice().sort((a,b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return { name: c.name, market: Math.round(median * 100) / 100, count: c.prices.length };
    })
    .sort((a, b) => b.market - a.market)
    .slice(0, 10);
}

const TODO_CHASE = Object.entries(sets).filter(([, v]) => !v.cards?.chaseCards?.length);
log(`${TODO_CHASE.length} sets need chase card scrape`);

// Get CDP connection once (reused across all sets)
const cdpBrowser = await getCdpBrowser();
if (cdpBrowser) log('✓ Connected to local Chrome via CDP');
else log('⚠ No CDP — using headed Playwright + proxy rotation');

let chaseHits = 0;

for (const [slug, setRec] of TODO_CHASE) {
  const setName = setRec.name || slug.replace(/-/g, ' ');
  log(`  [chase] ${slug}`);

  const chaseCards = await exhaustivePlaywright(
    'https://www.ebay.com',
    page => scrapeEbayDisney(setName, slug, page),
    { log: m => log(`    ${m}`) }
  );

  if (chaseCards?.length) {
    if (!setRec.cards) setRec.cards = {};
    setRec.cards.chaseCards = chaseCards;
    setRec.cards.topChase = chaseCards[0];
    setRec.cards.avgChasePrice = Math.round(chaseCards.reduce((a,c) => a+c.market, 0) / chaseCards.length);
    setRec.cards.fetchedAt = new Date().toISOString().slice(0,10);
    setRec.cards.source = 'ebay-sold-comps';
    log(`  ✓ ${slug} → ${chaseCards.length} chase, top: ${chaseCards[0].name} $${chaseCards[0].market}`);
    chaseHits++;
  } else {
    if (!setRec.cards) setRec.cards = {};
    setRec.cards.chaseCards = [];
    setRec.cards.fetchedAt = new Date().toISOString().slice(0,10);
    log(`  · ${slug} (0 results after all methods)`);
  }

  save(db);
  await sleep(2000);
}

log(`\n[disney-backfill] DONE — Phase2: ${chaseHits}/${TODO_CHASE.length} sets with chase cards`);
log(`[disney-backfill] DB: ${Object.keys(sets).length} sets, ${Object.values(sets).filter(s=>Object.keys(s.products||{}).length>0).length} with products`);
