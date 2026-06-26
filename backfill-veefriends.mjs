#!/usr/bin/env node
// Backfill VeeFriends: eBay chase cards + sealed product prices.
// VeeFriends is NOT on TCGCSV — eBay sold comps only.
import { writeFileSync, readFileSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { exhaustivePlaywright } from './lib/exhaustive-fetch.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'set-history-veefriends.json');
const LOG = join(ROOT, 'backfill-veefriends.log');

const log = msg => { console.log(msg); appendFileSync(LOG, msg + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = db => { db._meta.updated = new Date().toISOString().slice(0,10); writeFileSync(OUT, JSON.stringify(db, null, 2)); };

const db = JSON.parse(readFileSync(OUT, 'utf8'));
const sets = db.sets;

// eBay sold query per set
const QUERIES = {
  'veefriends-series-1': ['VeeFriends Series 1 card', 'VeeFriends S1 rare'],
  'veefriends-series-2': ['VeeFriends Series 2 card', 'VeeFriends S2 rare'],
  'veefriends-compete-and-collect': ['VeeFriends Compete Collect card', 'VeeFriends CC rare'],
  'veefriends-series-3': ['VeeFriends Series 3 card', 'VeeFriends S3 rare'],
};

// Sealed product queries
const SEALED_QUERIES = {
  'veefriends-series-1': 'VeeFriends Series 1 booster box sealed',
  'veefriends-series-2': 'VeeFriends Series 2 booster box sealed',
  'veefriends-compete-and-collect': 'VeeFriends Compete Collect booster box sealed',
  'veefriends-series-3': 'VeeFriends Series 3 booster box sealed',
};

const SKIP = /^(lot|bundle|case|sealed|repack|break|collection|\d+\s+card)/i;

async function scrapeEbayCards(queries, page) {
  let singles = [];
  for (const q of queries) {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(1500);
    const items = await page.$$eval('li.s-item', els => els.map(el => ({
      title: el.querySelector('.s-item__title')?.textContent?.trim() ?? '',
      price: parseFloat((el.querySelector('.s-item__price')?.textContent?.trim() ?? '0').replace(/[^0-9.]/g,'')),
    }))).catch(() => []);
    singles = items.filter(i => i.price >= 3 && i.price <= 2000 && !SKIP.test(i.title) && i.title.length > 5);
    if (singles.length >= 5) break;
  }
  if (!singles.length) return [];
  const charMap = new Map();
  for (const { title, price } of singles) {
    const cleaned = title.replace(/veefriends|series\s*\d|compete|collect/gi,'').replace(/\b(psa|bgs|sgc|cgc)\s*\d+/gi,'').replace(/\s+/g,' ').trim();
    const key = cleaned.split(' ').slice(0,3).join(' ').toLowerCase();
    if (!charMap.has(key)) charMap.set(key, { name: cleaned.split(' ').slice(0,3).join(' '), prices: [] });
    charMap.get(key).prices.push(price);
  }
  return [...charMap.values()]
    .map(c => { const s = c.prices.slice().sort((a,b)=>a-b); return { name: c.name, market: Math.round(s[Math.floor(s.length/2)]*100)/100, count: c.prices.length }; })
    .sort((a,b) => b.market - a.market).slice(0,10);
}

async function scrapeEbaySealed(query, page) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=0&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=20`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  await sleep(1500);
  const items = await page.$$eval('li.s-item', els => els.map(el => ({
    price: parseFloat((el.querySelector('.s-item__price')?.textContent?.trim() ?? '0').replace(/[^0-9.]/g,'')),
  }))).catch(() => []);
  const prices = items.map(i=>i.price).filter(p=>p>20&&p<5000);
  if (!prices.length) return null;
  const sorted = prices.slice().sort((a,b)=>a-b);
  return { current: Math.round(sorted[Math.floor(sorted.length/2)]*100)/100, count: prices.length, source: 'ebay-sold-comps' };
}

log(`[veefriends] backfill starting — ${Object.keys(sets).length} sets`);

for (const [slug, setRec] of Object.entries(sets)) {
  log(`\n[${slug}]`);
  const queries = QUERIES[slug] ?? [];
  const sealedQuery = SEALED_QUERIES[slug];

  await exhaustivePlaywright('https://www.ebay.com', async page => {
    // Chase cards
    if (!setRec.cards?.chaseCards?.length) {
      const chaseCards = await scrapeEbayCards(queries, page);
      if (!setRec.cards) setRec.cards = {};
      setRec.cards.chaseCards = chaseCards;
      setRec.cards.topChase = chaseCards[0] ?? null;
      setRec.cards.avgChasePrice = chaseCards.length ? Math.round(chaseCards.reduce((a,c)=>a+c.market,0)/chaseCards.length) : 0;
      setRec.cards.fetchedAt = new Date().toISOString().slice(0,10);
      setRec.cards.source = 'ebay-sold-comps';
      log(`  chase: ${chaseCards.length} cards, top: ${chaseCards[0]?.name} $${chaseCards[0]?.market}`);
    }
    // Sealed
    if (!Object.keys(setRec.products||{}).length && sealedQuery) {
      const sealed = await scrapeEbaySealed(sealedQuery, page);
      if (sealed) {
        if (!setRec.products) setRec.products = {};
        setRec.products['booster-box'] = { ...sealed, fetchedAt: new Date().toISOString().slice(0,10) };
        log(`  sealed box: $${sealed.current} (${sealed.count} sold)`);
      }
    }
  }, { log: m => log(`  ${m}`) });

  save(db);
  await sleep(2000);
}

log('\n[veefriends] DONE');
