#!/usr/bin/env node
/**
 * PLAYERCHASEMATCH ENRICHMENT
 * For each chase card in card-pricing-sports.json:
 *   1. eBay sold median (30d, proxy rotation)
 *   2. PriceCharting market price (Playwright scrape)
 * Writes enriched prices back to card-pricing-sports.json
 * Then re-matches all cards to player-history-sports.json
 *
 * Usage:
 *   node enrich-sports-chase-cards.mjs            — all cards
 *   node enrich-sports-chase-cards.mjs --force    — re-scrape even if priced within 7d
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { chromium } from 'playwright';

const CARD_PRICING_PATH = 'card-pricing-sports.json';
const PLAYERS_DB_PATH   = 'player-history-sports.json';
const SPORTS_DB_PATH    = 'set-history-sports.json';
const LOG_PATH          = 'enrich-sports-chase-cards.log';
const FORCE             = process.argv.includes('--force');
const STALE_DAYS        = 7;

const log = m => { console.log(m); appendFileSync(LOG_PATH, m + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Proxy loading ──────────────────────────────────────────────────────────
function loadProxies() {
  const f = existsSync('proxies-mobilemix.txt') ? 'proxies-mobilemix.txt'
    : existsSync('ISP.txt') ? 'ISP.txt' : null;
  if (!f) return [];
  const all = readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  const evomi = all.filter(l => l.startsWith('mp.evomi.com'));
  return evomi.length >= 5 ? evomi : all;
}
function randomProxy(proxies) {
  if (!proxies.length) return null;
  const line = proxies[Math.floor(Math.random() * proxies.length)];
  const [host, port, user, pass] = line.split(':');
  return { server: `http://${host}:${port}`, username: user, password: pass };
}

// ── Player matching (from rematch-sports-players.mjs) ──────────────────────
const SUFFIX_NOISE = new Set([
  'signatures','contenders','prizmatrix','spectra','inception','sensational','geometric',
  'throwback','rookies','wnba','picks','rpa','true','ucc','reverence','redeemed',
  'stars','future','auto','autograph','patch','refractor','parallel','variation','ssp',
  'base','insert','numbered','printing','plate','chrome','hobby','retail','draft','bowman',
  'panini','topps','prizm','immaculate','treasures','national',
]);

function normName(n) {
  return String(n ?? '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}
function cleanName(name) {
  const parts = normName(name).split(' ');
  while (parts.length > 2 && SUFFIX_NOISE.has(parts[parts.length - 1])) parts.pop();
  while (parts.length > 2 && SUFFIX_NOISE.has(parts[0])) parts.shift();
  return parts.join(' ');
}
function matchPlayer(playerName, players) {
  const norm = normName(playerName);
  const cleaned = cleanName(playerName);
  for (const [slug, p] of Object.entries(players)) {
    if (p.name && normName(p.name) === norm) return slug;
  }
  for (const [slug, p] of Object.entries(players)) {
    if (p.name && normName(p.name) === cleaned) return slug;
  }
  const parts = cleaned.split(' ');
  if (parts.length < 2) return null;
  const first = parts[0], last = parts[parts.length - 1];
  if (first.length < 2 || last.length < 2) return null;
  for (const [slug, p] of Object.entries(players)) {
    if (!p.name) continue;
    const pn = normName(p.name);
    if (pn.includes(first) && pn.includes(last)) return slug;
  }
  return null;
}

// ── PriceCharting slug builder ────────────────────────────────────────────
// Sports card URL: /game/<sport>-cards/<year>-<brand>-<player-slug>
// e.g. /game/baseball-cards/2026-topps-chrome-shohei-ohtani
function buildPcSlug(card) {
  const sport = card.sport ?? (card.setKey?.includes('baseball') ? 'baseball'
    : card.setKey?.includes('basketball') ? 'basketball'
    : card.setKey?.includes('football') ? 'football' : 'baseball');
  const category = `${sport}-cards`;

  // Build card-level slug from player + set + cardType
  const playerSlug = normName(card.player).replace(/\s+/g, '-');
  // Extract year + brand from setName
  const yearM = (card.setName ?? '').match(/\b(20\d\d)\b/);
  const year = yearM ? yearM[1] : '';
  const brandSlug = normName(card.setName ?? '').replace(/\s+/g, '-').slice(0, 40);
  // Try: /game/baseball-cards/2026-topps-chrome-baseball-shohei-ohtani
  return `https://www.pricecharting.com/game/${category}/${brandSlug}-${playerSlug}`;
}

// ── PriceCharting scrape (single card) ────────────────────────────────────
async function pcCardPrice(card, browser, proxies) {
  const url = buildPcSlug(card);
  const proxy = randomProxy(proxies);
  let ctx;
  try {
    ctx = await browser.newContext({
      proxy: proxy ? proxy : undefined,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const content = await page.content();
    await ctx.close();

    // Extract chart_data (current market price)
    const chartM = content.match(/chart_data\s*=\s*(\{[\s\S]+?\});\s*\n/);
    if (chartM) {
      const data = JSON.parse(chartM[1]);
      // chart_data.used = graded, chart_data.ungraded = raw market
      const series = data.ungraded ?? data.used ?? null;
      if (series?.data?.length) {
        const latest = series.data[series.data.length - 1];
        const price = latest[1] / 100; // cents to dollars
        return { pcMarket: price, pcUrl: url };
      }
    }

    // Alternative: look for price in JSON-LD or span
    const priceM = content.match(/"price"\s*:\s*"?([\d.]+)"?/);
    if (priceM) return { pcMarket: parseFloat(priceM[1]), pcUrl: url };

    return null;
  } catch (e) {
    if (ctx) await ctx.close().catch(() => {});
    return null;
  }
}

// ── eBay sold median ──────────────────────────────────────────────────────
async function eBaySoldMedian(card, browser, proxies) {
  const query = `${card.player} ${card.cardType ?? ''} ${card.setName ?? ''} ${card.printRun ? '/' + card.printRun : ''}`.trim().replace(/\s+/g, ' ');
  const proxy = randomProxy(proxies);
  let ctx;
  try {
    ctx = await browser.newContext({
      proxy: proxy ? proxy : undefined,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const page = await ctx.newPage();
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=60`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForSelector('.s-item, .s-card', { timeout: 8000 }).catch(() => {});
    await sleep(1000);

    const prices = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.s-item, li.s-card')];
      const results = [];
      for (const item of items) {
        const titleEl = item.querySelector('[class*="title"], h3, .s-item__title') ?? item.querySelector('a');
        const title = titleEl?.textContent?.trim() ?? '';
        if (!title || title === 'Shop on eBay') continue;
        const priceEl = item.querySelector('[class*="s-item__price"], [class*="price"]');
        const raw = priceEl?.textContent?.replace(/[^0-9.]/g, '') ?? '';
        const price = parseFloat(raw);
        if (price > 0) results.push(price);
      }
      return results;
    });
    await ctx.close();

    if (!prices.length) return null;
    prices.sort((a, b) => a - b);
    const med = prices[Math.floor(prices.length / 2)];
    return { ebayMedian: med, ebayCount: prices.length, ebayQuery: query };
  } catch (e) {
    if (ctx) await ctx.close().catch(() => {});
    return null;
  }
}

// ── isStale check ──────────────────────────────────────────────────────────
function isStale(card) {
  if (FORCE) return true;
  const ts = card.enrichedAt;
  if (!ts) return true;
  const age = (Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24);
  return age > STALE_DAYS;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  log(`\n[enrich-sports-chase-cards] ${new Date().toISOString()}`);

  const proxies = loadProxies();
  log(`  proxies: ${proxies.length}`);

  // Load DBs
  const cardDb    = JSON.parse(readFileSync(CARD_PRICING_PATH, 'utf8'));
  const playersDb = JSON.parse(readFileSync(PLAYERS_DB_PATH, 'utf8'));
  const sportsDb  = JSON.parse(readFileSync(SPORTS_DB_PATH, 'utf8'));
  const cards     = cardDb.cards ?? {};
  const players   = playersDb.players ?? {};
  const sportsSets = sportsDb.sets ?? {};

  // Build index of all chase cards from set-history-sports too (may have more than card-pricing)
  const allCards = { ...cards };
  for (const [setKey, setRec] of Object.entries(sportsSets)) {
    for (const cc of setRec.cards?.chaseCards ?? []) {
      const key = `${setKey}__${normName(cc.player ?? '').replace(/\s+/g,'-')}__${normName(cc.cardType ?? '').replace(/\s+/g,'-')}`;
      if (!allCards[key]) {
        allCards[key] = {
          setKey, setName: setRec.name ?? setKey,
          player: cc.player, cardType: cc.cardType,
          printRun: cc.printRun ?? null,
          sport: setKey.includes('baseball') ? 'baseball' : setKey.includes('basketball') ? 'basketball' : 'football',
          ebayMedian: cc.price ?? null,
          fetchedAt: cc.fetchedAt ?? null,
          source: 'ebay-sold-comps',
        };
      }
    }
  }

  const toEnrich = Object.entries(allCards).filter(([, c]) => isStale(c));
  log(`  total cards: ${Object.keys(allCards).length}  to enrich: ${toEnrich.length}`);

  // CDP real browser preferred (user's Chrome on --remote-debugging-port=9222)
  // Fallback: headed Playwright + proxy (may be blocked by eBay bot detection)
  let browser, usingCdp = false;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    usingCdp = true;
    log('  [CDP] connected to real Chrome');
  } catch {
    log('  [CDP] not available — using headed Playwright (may be blocked by eBay)');
    browser = await chromium.launch({ headless: false });
  }

  let done = 0, pcHits = 0, ebayHits = 0;

  for (const [key, card] of toEnrich) {
    log(`  [${done + 1}/${toEnrich.length}] ${card.player} — ${card.cardType} (${card.setName})`);

    // eBay sold
    const ebay = await eBaySoldMedian(card, browser, proxies);
    if (ebay) {
      card.ebayMedian = ebay.ebayMedian;
      card.ebayCount  = ebay.ebayCount;
      card.ebayQuery  = ebay.ebayQuery;
      ebayHits++;
      log(`    eBay: $${ebay.ebayMedian} (${ebay.ebayCount} sold)`);
    }
    await sleep(2000 + Math.random() * 2000);

    // PriceCharting — skip if Cloudflare blocking (headless fails); log attempt
    const pc = await pcCardPrice(card, browser, proxies);
    if (pc) {
      card.pcMarket = pc.pcMarket;
      card.pcUrl    = pc.pcUrl;
      pcHits++;
      log(`    PC: $${pc.pcMarket}`);
    } else {
      log(`    PC: no data`);
    }
    await sleep(1500 + Math.random() * 1500);

    card.enrichedAt = new Date().toISOString();
    allCards[key] = card;
    done++;

    // Save every 10 cards
    if (done % 10 === 0) {
      cardDb.cards = allCards;
      cardDb._meta = { ...cardDb._meta, updated: new Date().toISOString().slice(0, 10), count: Object.keys(allCards).length };
      writeFileSync(CARD_PRICING_PATH, JSON.stringify(cardDb, null, 2));
      log(`  [saved] ${done} done`);
    }
  }

  if (!usingCdp) await browser.close();

  // Final save of card DB
  cardDb.cards = allCards;
  cardDb._meta = { description: 'Individual sports card pricing DB', source: 'ebay-sold-comps + pricecharting', updated: new Date().toISOString().slice(0, 10), count: Object.keys(allCards).length };
  writeFileSync(CARD_PRICING_PATH, JSON.stringify(cardDb, null, 2));
  log(`\n  cards saved: ${Object.keys(allCards).length}  eBay hits: ${ebayHits}  PC hits: ${pcHits}`);

  // ── Player matching ──────────────────────────────────────────────────────
  log('\n── Player matching ──');
  let matched = 0, totalAttempted = 0;

  for (const [key, card] of Object.entries(allCards)) {
    if (!card.player) continue;
    totalAttempted++;
    const slug = matchPlayer(card.player, players);
    if (!slug) continue;

    const player = players[slug];
    if (!player.cards) player.cards = [];

    const existing = player.cards.find(c =>
      normName(c.setName) === normName(card.setName) &&
      normName(c.cardType) === normName(card.cardType)
    );

    const cardEntry = {
      setKey:      card.setKey,
      setName:     card.setName,
      cardType:    card.cardType,
      printRun:    card.printRun ?? null,
      ebayMedian:  card.ebayMedian ?? null,
      pcMarket:    card.pcMarket ?? null,
      star:        (card.ebayMedian ?? card.pcMarket ?? 0) > 200,
      enrichedAt:  card.enrichedAt,
      source:      'enrich-sports-chase-cards',
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
