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
function getMissingSets() {
  const raw = JSON.parse(readFileSync(SPORTS_DB_PATH,'utf8'));
  const sets = raw.sets ?? raw;
  return Object.entries(sets)
    .filter(([,v]) => {
      const y = v.year ?? 0;
      if (y < MIN_YR || y > MAX_YR) return false;
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

async function scrapeSet(setInfo, proxies) {
  const query = setInfo.name + ' rookie auto';
  log(`  → eBay scrape: "${query}"`);
  const proxy = randomProxy(proxies);
  const browser = await chromium.launch({
    headless: true,
    proxy: proxy ? { server: proxy.server, username: proxy.username, password: proxy.password } : undefined,
  });
  let cards = [];
  try {
    const ctx = await browser.newContext({ userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
    const page = await ctx.newPage();
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=0&LH_Sold=1&LH_Complete=1&_sop=12&_ipg=60`;
    await page.goto(url, { timeout: 30000, waitUntil:'domcontentloaded' });
    await page.waitForSelector('.s-item,.s-card', { timeout:8000 }).catch(()=>{});

    const items = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.s-item,.s-card')];
      return els.slice(0, 60).map(el => {
        const titleEl = el.querySelector('[class*="title"],h3,.s-item__title') ?? el.querySelector('a');
        const priceEl = el.querySelector('[class*="s-card__price"],[class*="price"],.s-item__price');
        return {
          title: titleEl?.textContent?.trim() ?? '',
          price: priceEl?.textContent?.trim() ?? '',
        };
      }).filter(i => i.title && i.price && !i.title.includes('Shop on eBay'));
    });

    const seen = new Set();
    for (const item of items) {
      const price = parsePrice(item.price);
      if (!price || price < 5 || price > 500000) continue;
      const player = parsePlayer(item.title);
      if (!player || player.length < 4) continue;
      const cardType = parseCardType(item.title);
      const printRun = parsePrintRun(item.title);
      const graded   = parseGrade(item.title);
      const key = `${player}::${cardType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ player, cardType, printRun, graded, price, rawTitle: item.title, source:'ebay-sold-comps', fetchedAt: new Date().toISOString().slice(0,10) });
    }
    cards.sort((a,b) => b.price - a.price);
    cards = cards.slice(0, 20);
  } catch(e) {
    log(`  ✗ scrape error: ${e.message}`);
  } finally {
    await browser.close();
  }
  return cards;
}

function writeSetChase(setKey, cards) {
  const raw = JSON.parse(readFileSync(SPORTS_DB_PATH,'utf8'));
  const sets = raw.sets ?? raw;
  if (!sets[setKey]) return;
  if (!sets[setKey].cards) sets[setKey].cards = {};
  sets[setKey].cards.chaseCards  = cards;
  sets[setKey].cards.chaseTotal  = cards.length;
  sets[setKey].cards.topChasePrice = cards[0]?.price ?? null;
  sets[setKey].cards.avgChasePrice = cards.length ? Math.round(cards.reduce((s,c)=>s+c.price,0)/cards.length) : null;
  sets[setKey].cards.fetchedAt   = new Date().toISOString().slice(0,10);
  // top-level shortcut for API
  if (cards[0]) {
    sets[setKey].chaseCard = { name: cards[0].player, market: cards[0].price, rarity: cards[0].cardType };
  }
  if (raw.sets) raw.sets = sets; else Object.assign(raw, sets);
  writeFileSync(SPORTS_DB_PATH, JSON.stringify(raw, null, 2));
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

    log(`\n[Round ${round}] Completed ${roundDone}/${missing.length}`);
    // Brief pause between rounds
    await new Promise(r => setTimeout(r, 5000));
  }
}

main().catch(e => { log('FATAL:', e.message); process.exit(1); });
