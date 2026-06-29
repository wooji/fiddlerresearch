#!/usr/bin/env node
/**
 * Self-healing autonomous sports card backfill.
 * - Loops until ALL sets have chase data
 * - On stall (5 consecutive empty): diagnose → rotate proxy → verify 3 test scrapes → continue
 * - On crash: restarts browser, verifies connectivity before resuming
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { chromium } from 'playwright';

const SPORTS_DB_PATH = 'set-history-sports.json';
const LOG_PATH       = 'backfill-sports-auto.log';
const STATE_PATH     = 'backfill-sports-auto-state.json';

const args   = process.argv.slice(2);
const MIN_YR = parseInt(args.find(a=>a.startsWith('--min-year='))?.split('=')[1] ?? '2010');
const MAX_YR = parseInt(args.find(a=>a.startsWith('--max-year='))?.split('=')[1] ?? '2024');

// ── Logging ──────────────────────────────────────────────────────────────────
function log(...msg) {
  const line = '[' + new Date().toISOString().slice(11,19) + '] ' + msg.join(' ');
  console.log(line);
  try {
    const prev = existsSync(LOG_PATH) ? readFileSync(LOG_PATH,'utf8') : '';
    writeFileSync(LOG_PATH, prev + line + '\n');
  } catch {}
}

// ── Proxies ───────────────────────────────────────────────────────────────────
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

// ── Browser (shared, recycled every 30 sets) ─────────────────────────────────
let _browser = null, _page = null, _uses = 0;

async function launchBrowser(proxies) {
  try { await _browser?.close(); } catch {}
  _browser = null; _page = null;
  const proxy = randomProxy(proxies);
  _browser = await chromium.launch({
    headless: true,
    proxy: proxy ? { server:proxy.server, username:proxy.username, password:proxy.password } : undefined,
  });
  const ctx = await _browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  _page = await ctx.newPage();
  _uses = 0;
  log(`[browser] launched${proxy ? ' via '+proxy.server : ' direct'}`);
}

async function getPage(proxies) {
  if (!_browser || !_page) await launchBrowser(proxies);
  _uses++;
  if (_uses >= 30) {
    log(`[browser] recycling after ${_uses} uses`);
    await launchBrowser(proxies);
  }
  return _page;
}

// ── eBay scrape ───────────────────────────────────────────────────────────────
async function ebaySearch(page, query) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_ipg=120&_sop=13&_udlo=10`;
  await page.goto(url, { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const head = document.querySelector('.srp-controls__count-heading')?.textContent ?? '';
    const m = head.match(/([\d,]+)\s+results?/i);
    const N = m ? parseInt(m[1].replace(/,/g,''),10) : Infinity;
    let items = Array.from(document.querySelectorAll('.srp-results .s-card, ul.srp-results li.s-item'));
    if (!items.length) items = Array.from(document.querySelectorAll('.s-card, li.s-item, li.s-card'));
    if (N < items.length) items = items.slice(0,N);
    return items.map(el => {
      let title = el.querySelector('h3,.s-item__title,[class*="s-card__title"]')?.textContent?.trim() ?? '';
      title = title.replace(/Opens in a new window[^.]*.?/gi,'').trim();
      const priceTxt = el.querySelector('[class*="s-card__price"],.s-item__price,[class*="price"]')?.textContent ?? '';
      return {title, priceTxt};
    }).filter(r => r.title && !r.title.toLowerCase().includes('shop on ebay'));
  });
}

// ── Verify eBay connectivity: run 3 known-good queries ───────────────────────
const VERIFY_QUERIES = [
  '2023 Panini Prizm Football rookie patch auto',
  '2022 Topps Chrome Baseball rookie auto',
  '2021 Panini Prizm Basketball rookie auto',
];
async function verifyConnectivity(proxies) {
  log('[verify] testing eBay connectivity with 3 known queries...');
  let passed = 0;
  for (const q of VERIFY_QUERIES) {
    try {
      await launchBrowser(proxies);
      const rows = await ebaySearch(_page, q);
      const hits = rows.filter(r => {
        const p = parseFloat((r.priceTxt.match(/\$([\d,]+\.?\d*)/)?.[1]??'').replace(/,/g,''));
        return p >= 10;
      });
      if (hits.length >= 3) {
        log(`  ✓ "${q.slice(0,40)}" → ${hits.length} results`);
        passed++;
      } else {
        log(`  ✗ "${q.slice(0,40)}" → only ${hits.length} results`);
      }
    } catch(e) {
      log(`  ✗ error: ${e.message?.slice(0,60)}`);
    }
  }
  log(`[verify] ${passed}/3 passed`);
  return passed >= 2; // require 2/3
}

// ── Self-heal: called when stall detected ────────────────────────────────────
async function selfHeal(proxies) {
  log('[heal] stall detected — diagnosing...');
  // try up to 5 different proxies
  for (let attempt = 0; attempt < 5; attempt++) {
    log(`[heal] attempt ${attempt+1}/5 — new proxy`);
    const ok = await verifyConnectivity(proxies);
    if (ok) {
      log('[heal] connectivity restored ✓');
      return true;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  log('[heal] FAILED — all proxies blocked, waiting 60s then retrying');
  await new Promise(r => setTimeout(r, 60000));
  return verifyConnectivity(proxies);
}

// ── Parse helpers ─────────────────────────────────────────────────────────────
const STOP = new Set(['ROOKIE','RC','AUTO','PATCH','PSA','BGS','SGC','CGC','GEM','MINT',
  'REFRACTOR','PRIZM','CHROME','TOPPS','PANINI','BOWMAN','SELECT','MOSAIC','DONRUSS',
  'CONTENDERS','SPECTRA','FLAWLESS','IMMACULATE','NATIONAL','TREASURES','OPTIC',
  'HOBBY','JUMBO','BLASTER','PACK','BOX','LOT','SET','CASE','GRADED','SLAB',
  'FOOTBALL','BASKETBALL','BASEBALL','NFL','NBA','MLB','CERTIFIED','PRESTIGE',
  'SCORE','ABSOLUTE','CHRONICLES','ORIGINS','OBSIDIAN','LUMINANCE','BLACK','GOLD',
  'FIVE','STAR','TIER','ONE','LEAF','SAGE','UPPER','DECK','CONTENDERS','PLAYOFF']);

function parsePlayer(title) {
  const words = title.replace(/[^a-zA-Z ]/g,' ').split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w.toUpperCase()));
  return words.slice(0,3).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ').trim() || null;
}
function parseCardType(title) {
  const t = title.toUpperCase();
  if (/PRINTING\s*PLATE|1\s*\/\s*1\b/i.test(t)) return 'Printing Plate 1/1';
  if (/\bRPA\b|ROOKIE\s*PATCH\s*AUTO/i.test(t)) return 'Rookie Patch Auto';
  if (/PATCH.*AUTO|AUTO.*PATCH/i.test(t)) return 'Patch Auto';
  if (/\bAUTO\b/i.test(t)) return 'Auto';
  if (/\bPATCH\b/i.test(t)) return 'Patch';
  if (/REFRACTOR/i.test(t)) return 'Refractor';
  return 'Card';
}
function parsePrintRun(title) {
  const m = title.match(/\/(\d+)\b/); return m ? parseInt(m[1]) : null;
}
function parseGrade(title) {
  const m = title.match(/\b(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)\b/i);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : null;
}

// ── Scrape one set ────────────────────────────────────────────────────────────
async function scrapeSet(setInfo, proxies) {
  const queries = [setInfo.name + ' rookie patch auto', setInfo.name + ' rookie auto'];
  let allListings = [];
  const seenTitles = new Set();
  const page = await getPage(proxies);

  for (const q of queries) {
    try {
      const rows = await ebaySearch(page, q);
      for (const row of rows) {
        if (seenTitles.has(row.title)) continue;
        seenTitles.add(row.title);
        const price = parseFloat((row.priceTxt.match(/\$([\d,]+\.?\d*)/)?.[1]??'').replace(/,/g,''));
        if (price >= 10) allListings.push({title:row.title, price});
      }
    } catch(e) {
      log(`  [ebay err] ${e.message?.slice(0,60)}`);
      try { await launchBrowser(proxies); } catch {}
    }
  }

  const seen = new Set();
  const cards = [];
  for (const item of allListings) {
    const player = parsePlayer(item.title);
    if (!player || player.length < 4) continue;
    const cardType = parseCardType(item.title);
    const key = `${player}::${cardType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      player, cardType,
      printRun: parsePrintRun(item.title),
      graded:   parseGrade(item.title),
      price:    item.price,
      rawTitle: item.title,
      source:   'ebay-sold-comps',
      fetchedAt: new Date().toISOString().slice(0,10),
    });
  }
  cards.sort((a,b)=>b.price-a.price);
  return cards.slice(0,20);
}

const CARD_PRICING_PATH = 'card-pricing-sports.json';

// ── DB (in-memory cache) ──────────────────────────────────────────────────────
let _db = null, _dirty = 0;
let _cp = null, _cpDirty = 0;

function loadDb() {
  if (!_db) _db = JSON.parse(readFileSync(SPORTS_DB_PATH,'utf8'));
  return _db;
}
function flushDb() {
  if (!_db || _dirty === 0) return;
  writeFileSync(SPORTS_DB_PATH, JSON.stringify(_db, null, 2));
  _dirty = 0;
  log('[db] flushed');
}
function loadCp() {
  if (!_cp) {
    _cp = existsSync(CARD_PRICING_PATH) ? JSON.parse(readFileSync(CARD_PRICING_PATH,'utf8')) : { _meta:{}, cards:{} };
    if (!_cp.cards) _cp.cards = {};
  }
  return _cp;
}
function flushCp() {
  if (!_cp || _cpDirty === 0) return;
  _cp._meta.updated = new Date().toISOString().slice(0,10);
  _cp._meta.count = Object.keys(_cp.cards).length;
  writeFileSync(CARD_PRICING_PATH, JSON.stringify(_cp, null, 2));
  _cpDirty = 0;
  log('[cp] flushed');
}
function writeSetChase(key, cards, setInfo) {
  const sets = loadDb().sets ?? loadDb();
  if (!sets[key]) return;
  if (!sets[key].cards) sets[key].cards = {};
  sets[key].cards.chaseCards    = cards;
  sets[key].cards.chaseTotal    = cards.length;
  sets[key].cards.topChasePrice = cards[0]?.price ?? null;
  sets[key].cards.fetchedAt     = new Date().toISOString().slice(0,10);
  if (cards[0]) sets[key].chaseCard = {name:cards[0].player, market:cards[0].price, rarity:cards[0].cardType};
  _dirty++;
  if (_dirty >= 10) { flushDb(); flushCp(); }

  // also write to card-pricing-sports.json for dashboard drilldown
  const cp = loadCp().cards;
  for (const c of cards) {
    const cpKey = `${key}::${c.player?.toLowerCase().replace(/\s+/g,'-')}::${c.cardType?.toLowerCase().replace(/\s+/g,'-')}`;
    cp[cpKey] = { setKey: key, setName: setInfo?.name ?? key, ...c };
    _cpDirty++;
  }
}
function getMissingSets() {
  const sets = loadDb().sets ?? loadDb();
  return Object.entries(sets)
    .filter(([,v]) => {
      const y = v.year ?? 0;
      if (y < MIN_YR || y > MAX_YR) return false;
      if (v.cards?.fetchedAt) return false;
      return !v.chaseCard && !v.cards?.chaseCards?.length;
    })
    .map(([k,v]) => ({key:k, name:v.name??k, year:v.year, sport:v.sport}))
    .sort((a,b)=>(b.year??0)-(a.year??0));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const proxies = loadProxies();
  log(`=== Sports Auto Backfill | proxies:${proxies.length} | years:${MIN_YR}-${MAX_YR} ===`);
  await launchBrowser(proxies);

  let round = 0;
  while (true) {
    round++;
    const missing = getMissingSets();
    log(`[Round ${round}] Missing: ${missing.length}`);
    if (missing.length === 0) { flushDb(); log('✅ ALL DONE'); break; }

    let consecutiveEmpty = 0;
    let roundSaved = 0;

    for (const setInfo of missing) {
      log(`[${setInfo.year}] ${setInfo.name}`);
      writeFileSync(STATE_PATH, JSON.stringify({round, remaining:missing.length, current:setInfo.name, saved:roundSaved, ts:new Date().toISOString()},null,2));

      // stall detection
      if (consecutiveEmpty >= 5) {
        log(`[stall] ${consecutiveEmpty} consecutive empty — healing`);
        const healed = await selfHeal(proxies);
        if (!healed) { log('[stall] giving up on this round, moving on'); }
        consecutiveEmpty = 0;
      }

      const cards = await scrapeSet(setInfo, proxies);
      writeSetChase(setInfo.key, cards, setInfo);

      if (cards.length > 0) {
        log(`  ✓ ${cards.length} cards | top: ${cards[0].player} $${cards[0].price}`);
        roundSaved++;
        consecutiveEmpty = 0;
      } else {
        log(`  ✗ no results — marked attempted`);
        consecutiveEmpty++;
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    flushDb(); flushCp();
    log(`[Round ${round}] saved ${roundSaved}/${missing.length}`);
    await new Promise(r => setTimeout(r, 3000));
  }
}

main()
  .then(()=>{ try{_browser?.close();}catch{} })
  .catch(e=>{ log('FATAL: '+e.message); try{_browser?.close();}catch{}; process.exit(1); });
