#!/usr/bin/env node
/**
 * Autonomous sports card backfill — loops until ALL sets in set-history-sports.json
 * have chase card data. Reads DB directly, scrapes missing sets via eBay,
 * writes back, repeats until 0 missing remain.
 *
 * Usage: node backfill-sports-auto.mjs [--min-year 2010] [--max-year 2025]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { chromium } from 'playwright';

const SPORTS_DB_PATH  = 'set-history-sports.json';
const PLAYERS_DB_PATH = 'player-history-sports.json';
const LOG_PATH        = 'backfill-sports-auto.log';
const STATE_PATH      = 'backfill-sports-auto-state.json';

const args   = process.argv.slice(2);
const MIN_YR = parseInt(args.find(a=>a.startsWith('--min-year='))?.split('=')[1] ?? '2010');
const MAX_YR = parseInt(args.find(a=>a.startsWith('--max-year='))?.split('=')[1] ?? '2025');

function log(...msg) {
  const line = msg.join(' ');
  console.log(line);
  try { const f = existsSync(LOG_PATH) ? readFileSync(LOG_PATH,'utf8') : ''; writeFileSync(LOG_PATH, f + line + '\n'); } catch {}
}

function loadProxies() {
  const f = existsSync('proxies-mobilemix.txt') ? 'proxies-mobilemix.txt'
    : existsSync('ISP.txt') ? 'ISP.txt' : null;
  if (!f) return [];
  const all = readFileSync(f,'utf8').trim().split('\n').filter(Boolean);
  const reliable = all.filter(l => l.split(':')[0] === 'mp.evomi.com');
  return reliable.length >= 10 ? reliable : all;
}
function randomProxy(proxies) {
  if (!proxies.length) return null;
  const [host,port,user,pass] = proxies[Math.floor(Math.random()*proxies.length)].split(':');
  return { server:`http://${host}:${port}`, username:user, password:pass };
}

// Read DB, return all sets missing chase data in year range
// Excludes sets that have cards.fetchedAt (attempted, even if empty)
function getMissingSets() {
  const raw  = loadDb();
  const sets = raw.sets ?? raw;
  return Object.entries(sets)
    .filter(([,v]) => {
      const y = v.year ?? 0;
      if (y < MIN_YR || y > MAX_YR) return false;
      if (v.cards?.fetchedAt) return false; // already attempted
      return !v.chaseCard && !(v.cards?.chaseCards?.length);
    })
    .map(([k,v]) => ({ key:k, name: v.name ?? k, year: v.year, sport: v.sport }))
    .sort((a,b) => (b.year??0)-(a.year??0)); // newest first
}

// Parse player name from eBay title
function parsePlayer(title) {
  const t = title.toUpperCase();
  const stopWords = ['ROOKIE','RC','AUTO','PATCH','PSA','BGS','SGC','CGC','GEM','MINT',
    'REFRACTOR','PRIZM','CHROME','TOPPS','PANINI','BOWMAN','SELECT','MOSAIC','DONRUSS',
    'CONTENDERS','SPECTRA','FLAWLESS','IMMACULATE','NATIONAL','TREASURES','OPTIC',
    'HOBBY','JUMBO','BLASTER','HANGER','FAT','PACK','BOX','LOT','SET','CASE',
    'GRADED','SLAB','CARD','CARDS','FOOTBALL','BASKETBALL','BASEBALL','NFL','NBA','MLB',
    'CERTIFIED','PRESTIGE','SCORE','ABSOLUTE','ILLUSIONS','MAJESTIC','CHRONICLES',
    'ORIGINS','OBSIDIAN','LUMINANCE','BLACK','GOLD','STANDARD','FIVE','STAR','TIER','ONE',
    '#','PSA10','PSA9','PSA8','BGS9'];
  const words = title.replace(/[^a-zA-Z ]/g,' ').split(/\s+/).filter(w=>w.length>1 && !stopWords.includes(w.toUpperCase()));
  return words.slice(0,3).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ').trim() || null;
}
function parseCardType(title) {
  const t = title.toUpperCase();
  const types = [];
  if (/PRINTING\s*PLATE|1\s*\/\s*1\b|1of1/i.test(t)) types.push('Printing Plate 1/1');
  else if (/\bRPA\b|ROOKIE\s*PATCH\s*AUTO/i.test(t)) types.push('Patch Auto');
  else if (/PATCH.*AUTO|AUTO.*PATCH/i.test(t)) types.push('Patch Auto');
  else if (/\bAUTO\b/i.test(t)) types.push('Auto');
  else if (/\bPATCH\b/i.test(t)) types.push('Patch');
  else if (/REFRACTOR/i.test(t)) types.push('Refractor');
  else if (/PRIZM/i.test(t)) types.push('Prizm');
  const prun = t.match(/\/(\d+)\b/);
  if (prun && !types[0]?.includes('1/1')) types.push(`/`+prun[1]);
  return types.join(' ').trim() || 'Card';
}
function parsePrintRun(title) {
  const m = title.match(/\/(\d+)\b/);
  return m ? parseInt(m[1]) : null;
}
function parseGrade(title) {
  const m = title.match(/\b(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)\b/i);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : null;
}
function parsePrice(txt) {
  const m = txt.replace(/,/g,'').match(/\$?([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

async function scrapeEbay(page, query) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_ipg=120&_sop=13&_udlo=20`;
  await page.goto(url, { waitUntil:'domcontentloaded', timeout:25000 });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const head = document.querySelector('.srp-controls__count-heading')?.textContent ?? '';
    const m = head.match(/([\d,]+)\s+results?/i);
    const N = m ? parseInt(m[1].replace(/,/g,''),10) : null;
    let items = Array.from(document.querySelectorAll('.srp-results .s-card, ul.srp-results li.s-item'));
    if (!items.length) items = Array.from(document.querySelectorAll('.s-card, li.s-item, li.s-card'));
    if (N && N > 0 && N < items.length) items = items.slice(0,N);
    return items.map(el => {
      let title = el.querySelector('h3,.s-item__title,[class*="s-card__title"]')?.textContent?.trim() ?? '';
      title = title.replace(/Opens in a new window[^.]*.?/gi,'').trim();
      const priceTxt = el.querySelector('[class*="s-card__price"],.s-item__price,[class*="price"]')?.textContent ?? '';
      return {title, priceTxt};
    }).filter(r => r.title && !r.title.toLowerCase().includes('shop on ebay') && !r.title.startsWith('ADVERTISEMENT'));
  });
}

// Shared browser + page — created once, reused across all sets
let _browser = null, _page = null, _pageUses = 0;
const PAGE_RECYCLE = 50; // recycle page every N sets to avoid memory bloat

async function getPage(proxies) {
  if (!_browser) {
    const proxy = randomProxy(proxies);
    _browser = await chromium.launch({
      headless: true,
      proxy: proxy ? { server:proxy.server, username:proxy.username, password:proxy.password } : undefined,
    });
    const ctx = await _browser.newContext({ userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
    _page = await ctx.newPage();
    log(`  [browser launched]`);
  }
  _pageUses++;
  if (_pageUses % PAGE_RECYCLE === 0) {
    // Recycle: close old browser, open fresh one with new proxy
    try { await _browser.close(); } catch {}
    _browser = null; _page = null;
    return getPage(proxies);
  }
  return _page;
}

async function scrapeSet(setInfo, proxies) {
  const queries = [
    setInfo.name + ' rookie patch auto',
    setInfo.name + ' rookie auto',
  ];
  log(`  → eBay: "${queries[0]}"`);
  let cards = [];
  try {
    const page = await getPage(proxies);
    const seenTitles = new Set();
    const listings   = [];
    for (const q of queries) {
      try {
        const rows = await scrapeEbay(page, q);
        for (const row of rows) {
          if (seenTitles.has(row.title)) continue;
          seenTitles.add(row.title);
          const price = parseFloat((row.priceTxt.match(/\$([\d,]+\.?\d*)/)?.[1]??'').replace(/,/g,''));
          if (!price || price < 15) continue;
          listings.push({ title:row.title, price });
        }
      } catch(e) { log(`  [ebay] ${e.message?.slice(0,60)}`); }
    }
    const seen = new Set();
    for (const item of listings) {
      const player = parsePlayer(item.title);
      if (!player || player.length < 4) continue;
      const cardType = parseCardType(item.title);
      const key = `${player}::${cardType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ player, cardType, printRun:parsePrintRun(item.title), graded:parseGrade(item.title), price:item.price, rawTitle:item.title, source:'ebay-sold-comps', fetchedAt:new Date().toISOString().slice(0,10) });
    }
    cards.sort((a,b) => b.price - a.price);
    cards = cards.slice(0,20);
  } catch(e) {
    log(`  ✗ scrape error: ${e.message}`);
    // reset browser on error
    try { await _browser?.close(); } catch {}
    _browser = null; _page = null;
  }
  return cards;
}

// In-memory DB cache — load once, flush periodically
let _dbCache = null;
let _dirtyCount = 0;

function loadDb() {
  if (!_dbCache) _dbCache = JSON.parse(readFileSync(SPORTS_DB_PATH,'utf8'));
  return _dbCache;
}

function flushDb() {
  if (!_dbCache) return;
  const tmp = SPORTS_DB_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(_dbCache, null, 2));
  // atomic rename via overwrite
  writeFileSync(SPORTS_DB_PATH, JSON.stringify(_dbCache, null, 2));
  _dirtyCount = 0;
  log(`  [DB flushed]`);
}

function writeSetChase(setKey, cards) {
  const raw  = loadDb();
  const sets = raw.sets ?? raw;
  if (!sets[setKey]) return;
  if (!sets[setKey].cards) sets[setKey].cards = {};
  sets[setKey].cards.chaseCards    = cards;
  sets[setKey].cards.chaseTotal    = cards.length;
  sets[setKey].cards.topChasePrice = cards[0]?.price ?? null;
  sets[setKey].cards.avgChasePrice = cards.length ? Math.round(cards.reduce((s,c)=>s+c.price,0)/cards.length) : null;
  sets[setKey].cards.fetchedAt     = new Date().toISOString().slice(0,10);
  if (cards[0]) {
    sets[setKey].chaseCard = { name: cards[0].player, market: cards[0].price, rarity: cards[0].cardType };
  }
  _dirtyCount++;
  // flush every 10 sets
  if (_dirtyCount >= 10) flushDb();
}

function saveState(done, total, current) {
  writeFileSync(STATE_PATH, JSON.stringify({ done, total, current, ts: new Date().toISOString() }, null, 2));
}

async function main() {
  const proxies = loadProxies();
  log(`\n=== Sports Auto Backfill started | proxies:${proxies.length} | years:${MIN_YR}-${MAX_YR} ===`);

  let round = 0;
  while (true) {
    round++;
    const missing = getMissingSets();
    log(`\n[Round ${round}] Missing: ${missing.length} sets`);
    if (missing.length === 0) {
      flushDb();
      log('✅ All sets have chase data. Done.');
      saveState('ALL_DONE', 0, null);
      break;
    }

    saveState(0, missing.length, null);
    let roundDone = 0;

    for (const setInfo of missing) {
      log(`\n[${setInfo.year}] ${setInfo.name} (${setInfo.sport})`);
      saveState(roundDone, missing.length, setInfo.name);

      const cards = await scrapeSet(setInfo, proxies);
      if (cards.length > 0) {
        writeSetChase(setInfo.key, cards);
        log(`  ✓ saved ${cards.length} cards | top: ${cards[0].player} $${cards[0].price}`);
        roundDone++;
      } else {
        log(`  ✗ no cards found — marking as attempted`);
        // Mark with empty chaseCards so it doesn't re-queue every round
        writeSetChase(setInfo.key, []);
        roundDone++;
      }
      // brief pause between sets
      await new Promise(r => setTimeout(r, 2000));
    }

    flushDb();
    log(`\n[Round ${round}] Completed ${roundDone}/${missing.length}`);
    await new Promise(r => setTimeout(r, 5000));
  }
}

main()
  .then(() => { try { _browser?.close(); } catch {} })
  .catch(e => { log('FATAL:', e.message); try { _browser?.close(); } catch {}; process.exit(1); });
