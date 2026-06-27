#!/usr/bin/env node
/**
 * PLAYERCHASEMATCH ENRICHMENT
 * For each chase card in card-pricing-sports.json:
 *   1. sportscardspro.com search (PriceCharting sports sub-domain) — ungraded market price
 *   2. eBay sold search via sportscardspro sale history page
 * Uses node-fetch + proxy rotation. No Playwright/CDP required.
 *
 * Usage:
 *   node enrich-sports-chase-cards.mjs            — all stale cards
 *   node enrich-sports-chase-cards.mjs --force    — re-scrape all
 *   node enrich-sports-chase-cards.mjs --test     — first 5 cards only
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { createRequire } from 'module';

import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

const CARD_DB_PATH    = 'card-pricing-sports.json';
const PLAYERS_DB_PATH = 'player-history-sports.json';
const SPORTS_DB_PATH  = 'set-history-sports.json';
const LOG_PATH        = 'enrich-sports-chase-cards.log';
const FORCE           = process.argv.includes('--force');
const TEST            = process.argv.includes('--test');
const MATCH_ONLY      = process.argv.includes('--match-only');
const CONCURRENCY     = 5;
const STALE_DAYS      = 7;
const SCP_BASE        = 'https://www.sportscardspro.com';

const log = m => { console.log(m); appendFileSync(LOG_PATH, m + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Proxy loading ──────────────────────────────────────────────────────────
function loadProxies() {
  const f = existsSync('proxies-mobilemix.txt') ? 'proxies-mobilemix.txt'
    : existsSync('ISP.txt') ? 'ISP.txt' : null;
  if (!f) return [];
  return readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
}
function randomProxy(proxies) {
  if (!proxies.length) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

// ── HTTP via curl (bypasses CF TLS fingerprint check) ─────────────────────
async function httpGet(url, proxies, retries = 4) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0';

  async function curlFetch(proxyLine) {
    const args = [
      '-sL', url,
      '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,*/*;q=0.9',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '--max-time', '20',
      '--connect-timeout', '10',
      '--compressed',
    ];
    if (proxyLine) {
      const [host, port, user, pass] = proxyLine.split(':');
      args.push('--proxy', `http://${host}:${port}`, '--proxy-user', `${user}:${pass}`);
    }
    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024, timeout: 25000 });
    return stdout;
  }

  // Direct first
  try {
    const text = await curlFetch(null);
    if (text && !text.includes('Just a moment') && !text.includes('cf-challenge') && text.length > 500) return text;
    if (text.includes('Just a moment')) log(`    [CF] direct blocked — trying proxies`);
  } catch (e) {
    log(`    [err] direct curl: ${e.message?.slice(0, 80)}`);
  }

  // Proxy fallback
  for (let i = 0; i < retries; i++) {
    const proxy = randomProxy(proxies);
    try {
      const text = await curlFetch(proxy);
      if (!text || text.includes('Just a moment') || text.length < 500) {
        await sleep(1500 * (i + 1));
        continue;
      }
      return text;
    } catch (e) {
      log(`    [err] proxy attempt ${i + 1}: ${e.message?.slice(0, 60)}`);
      await sleep(1200);
    }
  }
  return null;
}

// ── SportsCardsPro search → card match ────────────────────────────────────
function buildQuery(card) {
  // Clean the player name — strip noise tokens that got prepended/appended
  const playerClean = cleanName(card.player);
  // Extract year from setName
  const yearM = (card.setName ?? '').match(/\b(20\d\d)\b/);
  const year = yearM ? yearM[1] : '';
  // Brand: first 2 non-year words from setName
  const brandWords = (card.setName ?? '').replace(/\b20\d\d\b/, '').trim().split(/\s+/).slice(0, 3).join(' ');
  // Card type simplified
  const typeShort = (card.cardType ?? '').replace(/\bnumbered\b/gi, '').replace(/\/\d+/g, '').trim().split(/\s+/).slice(0, 2).join(' ');

  return `${playerClean} ${year} ${brandWords} ${typeShort}`.replace(/\s+/g, ' ').trim();
}

function parseSearchResults(html, playerName, setName) {
  const rows = [];
  const rowRe = /<tr\s[^>]*id="product-(\d+)"[\s\S]*?<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[0];
    const idStr = m[1];

    const titleM = row.match(/<td class="title">\s*<a[^>]+href="([^"]+)"[^>]*>\s*([^<]+)/);
    if (!titleM) continue;
    const href = titleM[1].startsWith('http') ? titleM[1] : SCP_BASE + titleM[1];
    const title = titleM[2].trim();

    const printRunM = row.match(/list-print-run[^>]*>([^<]+)</);
    const printRun = printRunM ? printRunM[1].trim() : null;

    const priceM = row.match(/class="price numeric used_price">\s*<span[^>]*>([\$0-9,. ]+)</);
    const price = priceM ? parseFloat(priceM[1].replace(/[^0-9.]/g, '')) : null;

    const consoleM = row.match(/class="console[^"]*">[\s\S]*?<a[^>]+>([^<]+)<\/a>/);
    const setName = consoleM ? consoleM[1].trim() : null;

    rows.push({ id: idStr, href, title, printRun, price, setName });
  }

  if (!rows.length) return null;

  // Score rows: player name match + set name match + has price
  const normP = cleanName(playerName).replace(/[^a-z\s]/g, '');
  function score(r, setName) {
    let s = 0;
    const t = r.title.toLowerCase();
    const rs = (r.setName ?? '').toLowerCase();
    const sn = (setName ?? '').toLowerCase();

    // Player name match (most important)
    const nameParts = normP.split(' ').filter(p => p.length > 2);
    for (const part of nameParts) if (t.includes(part)) s += 20;

    // Set name overlap
    const setWords = sn.replace(/\b(baseball|basketball|football|hockey)\b/gi, '').split(/\s+/).filter(w => w.length > 2);
    for (const w of setWords) if (rs.includes(w)) s += 5;

    // Year match
    const yearM = sn.match(/\b(20\d\d)\b/);
    if (yearM && rs.includes(yearM[1])) s += 10;

    if (r.price && r.price > 0) s += 2;

    // Print run match — big bonus if card.printRun matches row printRun
    return s;
  }

  rows.sort((a, b) => score(b, setName) - score(a, setName));
  const nameParts = normP.split(' ').filter(p => p.length > 2);
  const best = rows.find(r => nameParts.every(p => r.title.toLowerCase().includes(p))) ?? rows[0];
  return best;
}

async function scpSearch(card, proxies) {
  const q = buildQuery(card);
  const url = `${SCP_BASE}/search-products?type=prices&q=${encodeURIComponent(q)}`;
  const html = await httpGet(url, proxies);
  if (!html) return null;

  const best = parseSearchResults(html, card.player, card.setName);
  if (!best || !best.price) return null;

  return { pcMarket: best.price, pcUrl: best.href, pcTitle: best.title, pcPrintRun: best.printRun, pcId: best.id };
}

// ── SCP card detail page — get all grade tiers from stored pcUrl ───────────
async function scpDetailPrices(pcUrl, proxies) {
  if (!pcUrl) return null;
  const html = await httpGet(pcUrl, proxies);
  if (!html) return null;

  const parse = s => s ? parseFloat(String(s).replace(/[^0-9.]/g, '')) || null : null;

  // Detail page: used_price=Ungraded, complete_price=Grade 9 equiv, new_price=PSA 10, graded_price=graded avg
  const priceById = id => {
    const m = html.match(new RegExp(`<td[^>]*id="${id}"[^>]*>[\\s\\S]*?js-price[^>]*>\\s*([^<]+)`));
    return parse(m?.[1]);
  };
  const usedM  = html.match(/<td[^>]*id="used_price"[^>]*>[\s\S]*?js-price[^>]*>\s*([^<]+)/);
  const cibM   = html.match(/<td[^>]*id="complete_price"[^>]*>[\s\S]*?js-price[^>]*>\s*([^<]+)/);
  const newM   = html.match(/<td[^>]*id="new_price"[^>]*>[\s\S]*?js-price[^>]*>\s*([^<]+)/);
  const gradedM = html.match(/<td[^>]*id="graded_price"[^>]*>[\s\S]*?js-price[^>]*>\s*([^<]+)/);

  const ug  = parse(usedM?.[1]);
  const g9  = parse(cibM?.[1]);
  const p10 = parse(newM?.[1]);
  const grad = parse(gradedM?.[1]);

  if (!ug && !g9 && !p10 && !grad) return null;
  return { pcUngraded: ug, pcGrade9: g9, pcPsa10: p10, pcGradedAvg: grad };
}

// ── isStale check ──────────────────────────────────────────────────────────
function isStale(card) {
  if (FORCE) return true;
  if (!card.enrichedAt) return true;
  const age = (Date.now() - new Date(card.enrichedAt).getTime()) / (1000 * 60 * 60 * 24);
  return age > STALE_DAYS;
}

// ── Player matching ────────────────────────────────────────────────────────
const SUFFIX_NOISE = new Set([
  'signatures','contenders','prizmatrix','spectra','inception','sensational','geometric',
  'throwback','rookies','picks','rpa','true','ucc','reverence','redeemed','stars','future',
  'auto','autograph','autos','patch','refractor','parallel','variation','ssp','base','insert',
  'numbered','printing','plate','chrome','hobby','retail','draft','bowman','rookie','rc',
  'panini','topps','prizm','immaculate','treasures','national','select','mosaic','hoops',
  'certified','optic','donruss','fleer','upper','deck','score','skybox','stadium','club',
  'mt','sky','true','on','top','first','next','made','jump','mega','boxes','game',
]);
function normName(n) {
  return String(n ?? '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}
function cleanName(name) {
  const parts = normName(name).split(' ').filter(Boolean);
  // Strip noise from both ends; keep at least 2 tokens
  while (parts.length > 2 && SUFFIX_NOISE.has(parts[parts.length - 1])) parts.pop();
  while (parts.length > 2 && SUFFIX_NOISE.has(parts[0])) parts.shift();
  // If still starts with noise token (e.g. "autos ernie"), strip one more if 2+ remain
  if (parts.length >= 2 && SUFFIX_NOISE.has(parts[0])) parts.shift();
  // Strip trailing noise even down to 2
  if (parts.length >= 2 && SUFFIX_NOISE.has(parts[parts.length - 1])) parts.pop();
  // Also strip abbreviated suffixes: "Ssp", "Iva", "Mt", "Top", single chars
  while (parts.length > 2 && parts[parts.length - 1].length <= 3) parts.pop();
  return parts.join(' ');
}
// Build name index once, reuse across calls
let _nameIndex = null;
function buildNameIndex(players) {
  if (_nameIndex) return _nameIndex;
  _nameIndex = new Map();
  for (const [slug, p] of Object.entries(players)) {
    if (!p.name) continue;
    _nameIndex.set(normName(p.name), slug);
  }
  return _nameIndex;
}

function matchPlayer(playerName, players, sport) {
  const idx = buildNameIndex(players);
  const norm = normName(playerName);
  const cleaned = cleanName(playerName);

  // Exact name match
  if (idx.has(norm)) return idx.get(norm);
  if (idx.has(cleaned)) return idx.get(cleaned);

  // First+last partial match — restrict to same sport prefix if known
  const parts = cleaned.split(' ').filter(p => p.length > 1);
  if (parts.length < 2) return null;
  const first = parts[0], last = parts[parts.length - 1];
  const sportPrefix = sport ? sport + '_' : null;

  for (const [slug, p] of Object.entries(players)) {
    if (!p.name) continue;
    if (sportPrefix && !slug.startsWith(sportPrefix)) continue;
    const pn = normName(p.name);
    if (pn.includes(first) && pn.includes(last)) return slug;
  }

  // Cross-sport fallback (Jr./Jr suffixes, accents)
  for (const [slug, p] of Object.entries(players)) {
    if (!p.name) continue;
    const pn = normName(p.name);
    if (pn.includes(first) && pn.includes(last)) return slug;
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  log(`\n[enrich-sports-chase-cards] ${new Date().toISOString()}${TEST ? ' [TEST MODE]' : ''}`);

  const proxies = loadProxies();
  log(`  proxies: ${proxies.length}`);

  const cardDb    = JSON.parse(readFileSync(CARD_DB_PATH, 'utf8'));
  const playersDb = JSON.parse(readFileSync(PLAYERS_DB_PATH, 'utf8'));
  const sportsDb  = existsSync(SPORTS_DB_PATH) ? JSON.parse(readFileSync(SPORTS_DB_PATH, 'utf8')) : { sets: {} };

  const cards   = cardDb.cards ?? {};
  const players = playersDb.players ?? {};

  // Fix null sport tags on existing cards
  for (const [key, card] of Object.entries(cards)) {
    if (!card.sport) {
      const sk = card.setKey ?? key;
      card.sport = sk.includes('basketball') ? 'basketball'
        : sk.includes('football') ? 'football'
        : sk.includes('hockey') ? 'hockey'
        : 'baseball';
    }
  }

  // Merge cards from set-history-sports chaseCards
  for (const [setKey, setRec] of Object.entries(sportsDb.sets ?? {})) {
    for (const cc of setRec.cards?.chaseCards ?? []) {
      const key = `${setKey}::${normName(cc.player ?? '').replace(/\s+/g, '-')}::${normName(cc.cardType ?? '').replace(/\s+/g, '-')}`;
      if (!cards[key]) {
        cards[key] = {
          setKey, setName: setRec.name ?? setKey,
          player: cc.player, cardType: cc.cardType,
          printRun: cc.printRun ?? null,
          sport: setKey.includes('basketball') ? 'basketball' : setKey.includes('football') ? 'football' : setKey.includes('hockey') ? 'hockey' : 'baseball',
          ebayMedian: cc.price ?? null, source: 'set-history-import',
        };
      }
    }
  }

  let toEnrich = MATCH_ONLY ? [] : Object.entries(cards).filter(([, c]) => isStale(c));
  if (TEST) toEnrich = toEnrich.slice(0, 5);

  log(`  total cards: ${Object.keys(cards).length}  to enrich: ${toEnrich.length}`);

  let done = 0, pcHits = 0, noData = 0;

  // Concurrent enrichment — CONCURRENCY parallel workers
  async function enrichCard([key, card], idx) {
    log(`  [${idx + 1}/${toEnrich.length}] ${card.player} — ${card.cardType} (${card.setName})`);
    // Search for card on SCP
    const pc = await scpSearch(card, proxies);
    if (pc) {
      card.pcMarket = pc.pcMarket;
      card.pcUrl    = pc.pcUrl;
      card.pcTitle  = pc.pcTitle;
      card.pcId     = pc.pcId;
      pcHits++;
      log(`    ✓ $${pc.pcMarket} "${pc.pcTitle}"`);

      // Fetch detail page for Grade 9 + PSA 10 tiers
      const detail = await scpDetailPrices(pc.pcUrl, proxies);
      if (detail) {
        card.pcUngraded  = detail.pcUngraded;
        card.pcGrade9    = detail.pcGrade9;
        card.pcPsa10     = detail.pcPsa10;
        card.pcGradedAvg = detail.pcGradedAvg;
        log(`    ✓ grades: raw=$${detail.pcUngraded} G9=$${detail.pcGrade9} PSA10=$${detail.pcPsa10} graded=$${detail.pcGradedAvg}`);
      }
      await sleep(300 + Math.random() * 200);
    } else {
      noData++;
      log(`    ✗ no data`);
    }
    card.enrichedAt = new Date().toISOString();
    cards[key] = card;
    done++;
    if (done % 25 === 0) {
      cardDb.cards = cards;
      cardDb._meta = { ...cardDb._meta, updated: new Date().toISOString().slice(0, 10), count: Object.keys(cards).length };
      writeFileSync(CARD_DB_PATH, JSON.stringify(cardDb, null, 2));
      log(`  [checkpoint] ${done}/${toEnrich.length} done (${pcHits} hits)`);
    }
  }

  // Run in batches of CONCURRENCY
  for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
    const batch = toEnrich.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((item, j) => enrichCard(item, i + j)));
    await sleep(300 + Math.random() * 200); // brief pause between batches
  }

  // Final card DB save
  cardDb.cards = cards;
  cardDb._meta = {
    description: 'Individual sports card pricing DB',
    source: 'sportscardspro.com (PriceCharting)',
    updated: new Date().toISOString().slice(0, 10),
    count: Object.keys(cards).length,
  };
  writeFileSync(CARD_DB_PATH, JSON.stringify(cardDb, null, 2));
  log(`\n  cards saved: ${Object.keys(cards).length}  SCP hits: ${pcHits}  no data: ${noData}`);

  // ── Player matching ──────────────────────────────────────────────────────
  log('\n── Player matching ──');
  let matched = 0, totalAttempted = 0;

  for (const [, card] of Object.entries(cards)) {
    if (!card.player) continue;
    totalAttempted++;
    const slug = matchPlayer(card.player, players, card.sport);
    if (!slug) continue;

    const player = players[slug];
    if (!player.cards) player.cards = [];

    const existing = player.cards.find(c =>
      normName(c.setName) === normName(card.setName) &&
      normName(c.cardType) === normName(card.cardType)
    );

    const cardEntry = {
      setKey:     card.setKey,
      setName:    card.setName,
      cardType:   card.cardType,
      printRun:   card.printRun ?? null,
      ebayMedian: card.ebayMedian ?? null,
      pcMarket:   card.pcMarket ?? null,
      pcUngraded: card.pcUngraded ?? null,
      pcGrade9:   card.pcGrade9 ?? null,
      pcPsa10:     card.pcPsa10 ?? null,
      pcGradedAvg: card.pcGradedAvg ?? null,
      pcUrl:       card.pcUrl ?? null,
      pcTitle:    card.pcTitle ?? null,
      star:       (card.pcMarket ?? card.ebayMedian ?? 0) > 200,
      enrichedAt: card.enrichedAt,
      source:     'enrich-sports-chase-cards',
    };

    if (existing) {
      Object.assign(existing, cardEntry);
    } else {
      player.cards.push(cardEntry);
      matched++;
    }
  }

  writeFileSync(PLAYERS_DB_PATH, JSON.stringify(playersDb, null, 2));
  const withCards = Object.values(players).filter(p => p.cards?.length > 0).length;
  log(`  matched: ${matched} new  total players with cards: ${withCards}/${Object.keys(players).length}`);
  log('\nDONE');
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
