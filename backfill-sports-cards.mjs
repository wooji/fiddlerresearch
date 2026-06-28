#!/usr/bin/env node
/**
 * Sports Cards Enrichment — Chase Cards + Player Matching
 *
 * For each real player-card set in set-history-sports.json:
 *   1. Scrape eBay sold listings to identify top chase cards (by title + price)
 *   2. Parse player name + card type from each title
 *   3. Write cards.chaseCards[] into the set record (like Pokemon DB)
 *   4. Match baseball players to player-history-sports.json
 *   5. Append card_type + products[] to each matched player
 *
 * Usage:
 *   node backfill-sports-cards.mjs             — process all 11 player-card sets
 *   node backfill-sports-cards.mjs "2025 Topps Chrome Baseball"
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { chromium } from 'playwright';

// Load reliable proxies: Evomi mobile (mp.evomi.com) + WoojiWashed ISP
// Filters out single-use geo-tagged (pg.proxi.es) and Byteful (high timeout rate)
function loadProxies() {
  const f = existsSync('proxies-mobilemix.txt') ? 'proxies-mobilemix.txt'
    : existsSync('ISP.txt') ? 'ISP.txt' : null;
  if (!f) return [];
  const all = readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  // Prefer Evomi + ISP providers; fallback to all if <10 reliable
  // Evomi mobile (mp.evomi.com) = only reliable provider for eBay; ISP proxies timeout
  const reliable = all.filter(l => l.split(':')[0] === 'mp.evomi.com');
  return reliable.length >= 10 ? reliable : all;
}
function randomProxy(proxies) {
  if (!proxies.length) return null;
  const line = proxies[Math.floor(Math.random() * proxies.length)];
  const [host, port, user, pass] = line.split(':');
  return { server: `http://${host}:${port}`, username: user, password: pass };
}

const SPORTS_DB_PATH = 'set-history-sports.json';
const PLAYERS_DB_PATH = 'player-history-sports.json';
const STATE_PATH = 'backfill-sports-cards-state.json';

// Real player-card sets — matches names in set-history-sports.json
const PLAYER_SETS = [
  { name: '2025 Topps Chrome Baseball', sport: 'baseball', year: 2025, brand: 'topps', tier: 'chrome' },
  { name: '2026 Topps Chrome Baseball', sport: 'baseball', year: 2026, brand: 'topps', tier: 'chrome' },
  { name: '2025 Bowman Chrome Baseball', sport: 'baseball', year: 2025, brand: 'bowman', tier: 'chrome' },
  { name: '2025 Topps Tier One Baseball', sport: 'baseball', year: 2025, brand: 'topps', tier: 'tier-one' },
  { name: '2026 Topps Tier One Baseball', sport: 'baseball', year: 2026, brand: 'topps', tier: 'tier-one' },
  { name: '2025 Panini Prizm Basketball', sport: 'basketball', year: 2025, brand: 'panini', tier: 'prizm' },
  { name: '2024 Panini Prizm Basketball', sport: 'basketball', year: 2024, brand: 'panini', tier: 'prizm' },
  { name: '2024 Topps Chrome Basketball NBA', sport: 'basketball', year: 2024, brand: 'topps', tier: 'chrome' },
  { name: '2025 Topps Chrome Basketball UCC', sport: 'basketball', year: 2025, brand: 'topps', tier: 'chrome' },
  { name: '2025 National Treasures Basketball', sport: 'basketball', year: 2025, brand: 'panini', tier: 'national-treasures' },
  { name: '2024 Panini Immaculate Basketball', sport: 'basketball', year: 2024, brand: 'panini', tier: 'immaculate' },
  // ── Football (NFL) 2017-2025 ──────────────────────────────────────────────
  // Prizm
  { name: '2017 Panini Prizm Football', sport: 'football', year: 2017, brand: 'panini', tier: 'prizm' },
  { name: '2018 Panini Prizm Football', sport: 'football', year: 2018, brand: 'panini', tier: 'prizm' },
  { name: '2019 Panini Prizm Football', sport: 'football', year: 2019, brand: 'panini', tier: 'prizm' },
  { name: '2020 Panini Prizm Football', sport: 'football', year: 2020, brand: 'panini', tier: 'prizm' },
  { name: '2021 Panini Prizm Football', sport: 'football', year: 2021, brand: 'panini', tier: 'prizm' },
  { name: '2022 Panini Prizm Football', sport: 'football', year: 2022, brand: 'panini', tier: 'prizm' },
  { name: '2023 Panini Prizm Football', sport: 'football', year: 2023, brand: 'panini', tier: 'prizm' },
  { name: '2024 Panini Prizm Football', sport: 'football', year: 2024, brand: 'panini', tier: 'prizm' },
  { name: '2025 Panini Prizm Football', sport: 'football', year: 2025, brand: 'panini', tier: 'prizm' },
  // National Treasures
  { name: '2017 Panini National Treasures Football', sport: 'football', year: 2017, brand: 'panini', tier: 'national-treasures' },
  { name: '2018 Panini National Treasures Football', sport: 'football', year: 2018, brand: 'panini', tier: 'national-treasures' },
  { name: '2019 Panini National Treasures Football', sport: 'football', year: 2019, brand: 'panini', tier: 'national-treasures' },
  { name: '2020 Panini National Treasures Football', sport: 'football', year: 2020, brand: 'panini', tier: 'national-treasures' },
  { name: '2021 Panini National Treasures Football', sport: 'football', year: 2021, brand: 'panini', tier: 'national-treasures' },
  { name: '2022 Panini National Treasures Football', sport: 'football', year: 2022, brand: 'panini', tier: 'national-treasures' },
  { name: '2023 Panini National Treasures Football', sport: 'football', year: 2023, brand: 'panini', tier: 'national-treasures' },
  { name: '2024 Panini National Treasures Football', sport: 'football', year: 2024, brand: 'panini', tier: 'national-treasures' },
  { name: '2025 Panini National Treasures Football', sport: 'football', year: 2025, brand: 'panini', tier: 'national-treasures' },
  // Immaculate
  { name: '2017 Panini Immaculate Football', sport: 'football', year: 2017, brand: 'panini', tier: 'immaculate' },
  { name: '2018 Panini Immaculate Football', sport: 'football', year: 2018, brand: 'panini', tier: 'immaculate' },
  { name: '2019 Panini Immaculate Football', sport: 'football', year: 2019, brand: 'panini', tier: 'immaculate' },
  { name: '2020 Panini Immaculate Football', sport: 'football', year: 2020, brand: 'panini', tier: 'immaculate' },
  { name: '2021 Panini Immaculate Football', sport: 'football', year: 2021, brand: 'panini', tier: 'immaculate' },
  { name: '2022 Panini Immaculate Football', sport: 'football', year: 2022, brand: 'panini', tier: 'immaculate' },
  { name: '2023 Panini Immaculate Football', sport: 'football', year: 2023, brand: 'panini', tier: 'immaculate' },
  { name: '2024 Panini Immaculate Football', sport: 'football', year: 2024, brand: 'panini', tier: 'immaculate' },
  // Select
  { name: '2017 Panini Select Football', sport: 'football', year: 2017, brand: 'panini', tier: 'select' },
  { name: '2018 Panini Select Football', sport: 'football', year: 2018, brand: 'panini', tier: 'select' },
  { name: '2019 Panini Select Football', sport: 'football', year: 2019, brand: 'panini', tier: 'select' },
  { name: '2020 Panini Select Football', sport: 'football', year: 2020, brand: 'panini', tier: 'select' },
  { name: '2021 Panini Select Football', sport: 'football', year: 2021, brand: 'panini', tier: 'select' },
  { name: '2022 Panini Select Football', sport: 'football', year: 2022, brand: 'panini', tier: 'select' },
  { name: '2023 Panini Select Football', sport: 'football', year: 2023, brand: 'panini', tier: 'select' },
  { name: '2024 Panini Select Football', sport: 'football', year: 2024, brand: 'panini', tier: 'select' },
  // Mosaic
  { name: '2019 Panini Mosaic Football', sport: 'football', year: 2019, brand: 'panini', tier: 'mosaic' },
  { name: '2020 Panini Mosaic Football', sport: 'football', year: 2020, brand: 'panini', tier: 'mosaic' },
  { name: '2021 Panini Mosaic Football', sport: 'football', year: 2021, brand: 'panini', tier: 'mosaic' },
  { name: '2022 Panini Mosaic Football', sport: 'football', year: 2022, brand: 'panini', tier: 'mosaic' },
  { name: '2023 Panini Mosaic Football', sport: 'football', year: 2023, brand: 'panini', tier: 'mosaic' },
  { name: '2024 Panini Mosaic Football', sport: 'football', year: 2024, brand: 'panini', tier: 'mosaic' },
  // Optic
  { name: '2017 Panini Donruss Optic Football', sport: 'football', year: 2017, brand: 'panini', tier: 'optic' },
  { name: '2018 Panini Donruss Optic Football', sport: 'football', year: 2018, brand: 'panini', tier: 'optic' },
  { name: '2019 Panini Donruss Optic Football', sport: 'football', year: 2019, brand: 'panini', tier: 'optic' },
  { name: '2020 Panini Donruss Optic Football', sport: 'football', year: 2020, brand: 'panini', tier: 'optic' },
  { name: '2021 Panini Donruss Optic Football', sport: 'football', year: 2021, brand: 'panini', tier: 'optic' },
  { name: '2022 Panini Donruss Optic Football', sport: 'football', year: 2022, brand: 'panini', tier: 'optic' },
  { name: '2023 Panini Donruss Optic Football', sport: 'football', year: 2023, brand: 'panini', tier: 'optic' },
  { name: '2024 Panini Donruss Optic Football', sport: 'football', year: 2024, brand: 'panini', tier: 'optic' },
  // Contenders
  { name: '2017 Panini Contenders Football', sport: 'football', year: 2017, brand: 'panini', tier: 'contenders' },
  { name: '2018 Panini Contenders Football', sport: 'football', year: 2018, brand: 'panini', tier: 'contenders' },
  { name: '2019 Panini Contenders Football', sport: 'football', year: 2019, brand: 'panini', tier: 'contenders' },
  { name: '2020 Panini Contenders Football', sport: 'football', year: 2020, brand: 'panini', tier: 'contenders' },
  { name: '2021 Panini Contenders Football', sport: 'football', year: 2021, brand: 'panini', tier: 'contenders' },
  { name: '2022 Panini Contenders Football', sport: 'football', year: 2022, brand: 'panini', tier: 'contenders' },
  { name: '2023 Panini Contenders Football', sport: 'football', year: 2023, brand: 'panini', tier: 'contenders' },
  { name: '2024 Panini Contenders Football', sport: 'football', year: 2024, brand: 'panini', tier: 'contenders' },
];

// Card type classification patterns (order matters — most specific first)
const CARD_TYPE_PATTERNS = [
  { pattern: /logoman|1\/1\s*logoman/i, type: 'Logoman 1/1', rarity: 1 },
  { pattern: /superfractor|super\s*fractor/i, type: 'Superfractor 1/1', rarity: 1 },
  { pattern: /printing plate|print plate|1\/1/i, type: 'Printing Plate 1/1', rarity: 1 },
  { pattern: /auto.*patch.*\/(\d+)|patch.*auto.*\/(\d+)/i, type: 'Patch Auto', rarity: null },
  { pattern: /auto.*\/(5|10|15|25)\b/i, type: 'Numbered Auto', rarity: null },
  { pattern: /auto.*\/(50|99)\b/i, type: 'Auto RC', rarity: null },
  { pattern: /\bauto\b/i, type: 'Auto', rarity: null },
  { pattern: /patch.*\/(\d+)|relic.*\/(\d+)/i, type: 'Patch/Relic', rarity: null },
  { pattern: /gold\s*refractor|gold.*\/50\b/i, type: 'Gold Refractor /50', rarity: 50 },
  { pattern: /orange.*\/25\b|\/25\b.*orange/i, type: 'Orange /25', rarity: 25 },
  { pattern: /red.*\/5\b|\/5\b.*red/i, type: 'Red /5', rarity: 5 },
  { pattern: /blue.*\/150\b|\/150\b.*blue/i, type: 'Blue /150', rarity: 150 },
  { pattern: /prizm|refractor/i, type: 'Parallel', rarity: null },
  { pattern: /short print|sp\b/i, type: 'Short Print', rarity: null },
  { pattern: /rc\b|rookie card|rookie/i, type: 'Rookie Card', rarity: null },
  { pattern: /insert/i, type: 'Insert', rarity: null },
  { pattern: /base/i, type: 'Base', rarity: null },
];

// Extract print run number from title
function extractPrintRun(title) {
  const m = title.match(/\/(\d+)\b/g);
  if (!m) return null;
  const nums = m.map(n => parseInt(n.slice(1))).filter(n => n > 0 && n <= 10000);
  if (!nums.length) return null;
  return Math.min(...nums);
}

// Clean eBay title noise
function cleanTitle(title) {
  return title
    .replace(/Opens in a new window or tab\.?/gi, '')
    .replace(/Opens in a new window/gi, '')
    .replace(/MintOpens|MintOpen|Mint Opens/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Classify card type from title
function classifyCardType(title) {
  for (const { pattern, type } of CARD_TYPE_PATTERNS) {
    if (pattern.test(title)) {
      const printRun = extractPrintRun(title);
      // Only append print run if type doesn't already contain one
      if (printRun && !type.includes('/') && !type.match(/\d+/)) {
        return { type: `${type} /${printRun}`, printRun };
      }
      return { type, printRun };
    }
  }
  return { type: 'Base', printRun: null };
}

// Expanded stop-word list for player name extraction
const CARD_STOPWORDS = new Set([
  // Grading
  'psa','bgs','sgc','cgc','auth','gem','mint','nr','vg','ex',
  // Card types
  'auto','autograph','rc','rookie','card','refractor','prizm','patch','relic','chrome','parallel',
  'superfractor','logoman','insert','sp','short','print','numbered','holo','foil','buyback','error',
  'variation','cracked','ice','wave','mojo','shimmer','atomic','xfractor','aqua','scout',
  // Parallels / colors
  'gold','silver','blue','red','orange','green','purple','pink','black','white','yellow','teal',
  'sapphire','diamond','image','shimmer','shimmer','neon','copper','bronze','platinum','ivory',
  // Brands/sets
  'topps','panini','bowman','upper','deck','fleer','donruss','score','leaf','national','treasures',
  'immaculate','tier','one','prizm','optic','mosaic','select','hoops','chronicles',
  // Sports
  'basketball','baseball','football','soccer','hockey','nba','mlb','nfl','mls','nhl',
  // Products
  'hobby','box','pack','lot','sealed','graded','raw','base','draft','prospect','heritage',
  'platinum','series','update','traded','on-card','1st','bowman','chromatic',
  // Teams (common)
  'yankees','red','sox','cubs','mets','dodgers','giants','astros','braves','padres','cardinals',
  'phillies','nationals','brewers','pirates','reds','rockies','marlins','rays','orioles','blue',
  'jays','rangers','angels','athletics','mariners','royals','twins','indians','guardians','tigers',
  'whitesox','lakers','celtics','warriors','nets','knicks','bulls','heat','bucks','clippers',
  // Other noise
  'opens','new','window','tab','listing','lot','set','lot','bundle','case','factory','complete',
]);

// Extract player name from title using pattern matching
// Titles patterns:
//   "Paul Skenes 2025 Topps Chrome Baseball RC Auto /99 PSA 10"
//   "2025 Topps Chrome Baseball #RA-PS Paul Skenes RC Auto /25"
//   "PAUL SKENES 2025 Topps Chrome Rookie Autograph..."
function extractPlayerName(title, setName) {
  let t = title;

  // If title starts with words BEFORE a 4-digit year → those are likely the player name
  // Handles both "Paul Skenes 2025..." and "PAUL SKENES 2025..."
  const startNameMatch = t.match(/^([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'.]+){1,3})\s+(?:20\d\d|19\d\d)/);
  if (startNameMatch) {
    const candidate = startNameMatch[1];
    const words = candidate.split(/\s+/);
    const filtered = words.filter(w => !CARD_STOPWORDS.has(w.toLowerCase()));
    if (filtered.length >= 2) {
      return filtered.map(w =>
        w === w.toUpperCase() && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w
      ).join(' ');
    }
  }

  // Remove set name, card numbers, print runs, grading stamps
  t = t.replace(new RegExp(setName.replace(/[()]/g, '\\$&'), 'i'), '');
  t = t.replace(/\b(PSA|BGS|SGC|CGC)\s*\d+(\.\d+)?\b/gi, '');
  t = t.replace(/#[A-Z]{0,4}-?[A-Z0-9]+\b/g, '');
  t = t.replace(/\/\d+\b/g, '');
  t = t.replace(/\b\d+\/\d+\b/g, '');
  t = t.replace(/\d{4}/g, '');
  t = t.replace(/[^a-zA-Z\s'.]/g, ' ');

  // Tokenize and filter
  const tokens = t.split(/\s+/).map(w => w.trim()).filter(w => w.length > 1);
  const nameTokens = tokens.filter(w => {
    const lw = w.toLowerCase().replace(/[^a-z]/g,'');
    return lw.length > 1 && !CARD_STOPWORDS.has(lw) && /^[A-Z]/.test(w);
  });

  if (nameTokens.length >= 2) {
    const cleaned = nameTokens.slice(0, 3);
    // Convert all-caps tokens to Title Case (eBay sellers often type player names in caps)
    const titled = cleaned.map(w => {
      if (w === w.toUpperCase() && w.length > 1) {
        // All-caps — title-case it unless it's a stopword
        return w[0] + w.slice(1).toLowerCase();
      }
      return w;
    });
    // Reject if name looks like a generic phrase (all words are short or common)
    const realWords = titled.filter(w => w.length > 3 && !CARD_STOPWORDS.has(w.toLowerCase()));
    if (realWords.length < 1) return null;
    return titled.join(' ');
  }

  return null;
}

// Normalize name for matching (lowercase, no special chars)
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Search eBay sold listings for top chase cards in a set
async function scrapeChaseCards(setName, page) {
  // Use short set name without year for broader match; add sport keywords
  const shortName = setName.replace(/^\d{4}\s+/, ''); // strip year
  const queries = [
    `${setName} auto RC numbered`,
    `${shortName} auto /25`,
    `${shortName} auto /99 rookie`,
    `${shortName} patch auto PSA`,
  ];

  const seenTitles = new Set();
  const listings = [];

  for (const query of queries) {
    try {
      const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_ipg=120&_sop=13&_udlo=20`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1500);

      const rows = await page.evaluate(() => {
        const head = document.querySelector('.srp-controls__count-heading')?.textContent ?? '';
        const m = head.match(/([\d,]+)\s+results?/i);
        const N = m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
        let items = Array.from(document.querySelectorAll('.srp-results .s-card, ul.srp-results li.s-item'));
        if (!items.length) items = Array.from(document.querySelectorAll('.s-card, li.s-item, li.s-card'));
        if (N && N > 0 && N < items.length) items = items.slice(0, N);
        return items.map(el => {
          let title = el.querySelector('h3, .s-item__title, [class*="s-card__title"]')?.textContent?.trim() ?? '';
          title = title.replace(/Opens in a new window or tab\.?/gi, '').replace(/Opens in a new window/gi, '').trim();
          const priceTxt = el.querySelector('[class*="s-card__price"], .s-item__price, [class*="price"]')?.textContent ?? '';
          return { title, priceTxt };
        }).filter(r => r.title && !r.title.toLowerCase().includes('shop on ebay') && !r.title.startsWith('ADVERTISEMENT'));
      });

      for (const row of rows) {
        if (seenTitles.has(row.title)) continue;
        seenTitles.add(row.title);
        const price = parseFloat((row.priceTxt.match(/\$([\d,]+\.?\d*)/)?.[1] ?? '').replace(/,/g, ''));
        if (!price || price < 15) continue;
        listings.push({ title: row.title, price });
      }
    } catch (e) {
      console.log(`  [ebay] query error: ${e.message?.slice(0, 60)}`);
    }
  }

  return listings;
}

// All 30 NBA + 30 MLB team names (nicknames only — appears trailing in eBay titles)
const TEAM_NAMES = new Set([
  // NBA
  'lakers','celtics','warriors','nets','knicks','bulls','heat','bucks','clippers','nuggets',
  'suns','mavericks','mavs','spurs','rockets','thunder','blazers','jazz','timberwolves','wolves',
  'pelicans','kings','grizzlies','hawks','hornets','wizards','pistons','pacers','cavaliers','cavs',
  'magic','raptors','76ers','sixers',
  // MLB
  'yankees','redsox','cubs','mets','dodgers','giants','astros','braves','padres','cardinals',
  'phillies','nationals','brewers','pirates','reds','rockies','marlins','rays','orioles','bluejays',
  'rangers','angels','athletics','mariners','royals','twins','guardians','tigers','whitesox',
]);

// Card design/parallel variant names (appear trailing after player name)
const VARIANT_NAMES = new Set([
  'crystallized','chalktoss','chalk','pulsar','anime','penmanship','dna','lava','prizmatrix',
  'spectra','ultraviolet','refractor','atomic','shimmer','mojo','wave','xfractor','aqua',
  'electric','neon','galactic','cosmic','nebula','aurora','hypno','mosaic','kaleidoscope',
  'inception','sensational','geometric','reverence','redeemed','contenders','signatures',
  'rpa','first','firstbowman','base','logoman','superfractor','cracked','ice',
]);

// IP collab prefixes (appear BEFORE player name)
const COLLAB_PREFIXES = ['Cactus Jack', 'Travis Scott', 'Space Jam'];

// Extract all rich tokens from a raw eBay title
function extractRichTokens(title, playerName) {
  const result = {};

  // Graded copy (PSA 10, BGS 9.5, SGC 10, CGC 9)
  const gradedM = title.match(/\b(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)\b/i);
  if (gradedM) result.graded = `${gradedM[1].toUpperCase()} ${gradedM[2]}`;

  // Set/checklist code (#BCP-157, #RA-PS, #TC-12)
  const codeM = title.match(/#([A-Z]{0,4}-?[A-Z0-9]{1,6})\b/);
  if (codeM) result.setCode = codeM[0];

  // Year from title (first 4-digit year = card year)
  const yearM = title.match(/\b(20\d{2}|19\d{2})\b/);
  if (yearM) result.teamYear = parseInt(yearM[1]);

  // IP collab prefix
  for (const prefix of COLLAB_PREFIXES) {
    if (title.toLowerCase().includes(prefix.toLowerCase())) {
      result.collab = prefix;
      break;
    }
  }

  // Team name: look for team words AFTER player name in title
  if (playerName) {
    const playerIdx = title.toLowerCase().indexOf(playerName.toLowerCase().split(' ')[0]);
    const afterPlayer = playerIdx >= 0 ? title.slice(playerIdx + playerName.length) : title;
    const words = afterPlayer.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/);
    for (const w of words) {
      if (TEAM_NAMES.has(w)) { result.team = w[0].toUpperCase() + w.slice(1); break; }
    }
  }

  // Variant: design/parallel name after player name, not a team/card-type word
  if (playerName) {
    const playerIdx = title.toLowerCase().indexOf(playerName.toLowerCase().split(' ')[0]);
    const afterPlayer = playerIdx >= 0 ? title.slice(playerIdx + playerName.length) : title;
    const words = afterPlayer.replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    for (const w of words) {
      const lw = w.toLowerCase();
      if (VARIANT_NAMES.has(lw) && !CARD_STOPWORDS.has(lw)) {
        result.variant = w[0].toUpperCase() + w.slice(1).toLowerCase();
        break;
      }
    }
  }

  return result;
}

// Parse chase cards from eBay listings
function parseChaseCards(listings, setName) {
  const playerCards = new Map(); // playerName → best card entry

  for (const { title, price } of listings) {
    const playerName = extractPlayerName(title, setName);
    if (!playerName || playerName.split(' ').length < 2) continue;

    const { type, printRun } = classifyCardType(title);
    const enriched = extractRichTokens(title, playerName);
    const key = `${playerName}::${type}::${enriched.variant||''}`;

    if (!playerCards.has(key) || price > playerCards.get(key).price) {
      playerCards.set(key, {
        player: playerName,
        cardType: type,
        printRun,
        price,
        rawTitle: title,                        // FULL original title — never discard
        variant: enriched.variant ?? null,       // Crystallized, Chalk Toss, Pulsar, etc.
        team: enriched.team ?? null,             // Spurs, Mavericks, Warriors, etc.
        teamYear: enriched.teamYear ?? null,     // year from set name
        collab: enriched.collab ?? null,         // Cactus Jack, Travis Scott, etc.
        graded: enriched.graded ?? null,         // PSA 10, BGS 9.5, etc.
        setCode: enriched.setCode ?? null,       // #BCP-157, #RA-PS, etc.
        isChase: price > 100 || (printRun && printRun <= 99) || /auto|patch|logoman|superfractor/i.test(type),
      });
    }
  }

  // Sort by price desc, take top 20
  return Array.from(playerCards.values())
    .filter(c => c.isChase)
    .sort((a, b) => b.price - a.price)
    .slice(0, 20);
}

// Strip trailing card-type noise from a parsed name (e.g. "Luka Doncic Contenders" → "Luka Doncic")
function cleanParsedName(name) {
  const SUFFIX_NOISE = new Set([
    'signatures','contenders','prizmatrix','spectra','inception','sensational','geometric',
    'throwback','rookies','wnba','picks','rpa','few','true','ucc','reverence','redeemed',
    'stars','future','auto','autograph','patch','refractor','parallel','variation','ssp',
    'base','insert','numbered','printing','plate','chrome','hobby','retail','draft','bowman',
  ]);
  const parts = normalizeName(name).split(' ');
  // Remove trailing words that are card type noise
  while (parts.length > 2 && SUFFIX_NOISE.has(parts[parts.length - 1])) parts.pop();
  // Also remove leading noise (e.g. "Spectra Grant Hill")
  while (parts.length > 2 && SUFFIX_NOISE.has(parts[0])) parts.shift();
  return parts.join(' ');
}

// Match player name to player-history-sports.json
function matchPlayer(playerName, playersDb) {
  const norm = normalizeName(playerName);
  const cleaned = cleanParsedName(playerName);
  const players = playersDb.players ?? playersDb;

  // Exact match on original
  for (const [slug, p] of Object.entries(players)) {
    if (p.name && normalizeName(p.name) === norm) return slug;
  }

  // Exact match on cleaned name
  for (const [slug, p] of Object.entries(players)) {
    if (p.name && normalizeName(p.name) === cleaned) return slug;
  }

  // Fuzzy: first+last name from cleaned string
  const parts = cleaned.split(' ');
  if (parts.length < 2) return null;
  const [first, last] = [parts[0], parts[parts.length - 1]];

  for (const [slug, p] of Object.entries(players)) {
    if (!p.name) continue;
    const pn = normalizeName(p.name);
    if (pn.includes(first) && pn.includes(last)) return slug;
  }

  return null;
}

// Load / save state
function loadState() {
  if (!existsSync(STATE_PATH)) return { done: [], lastRun: null };
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}
function saveState(s) { writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }

async function main() {
  const targetName = process.argv[2];
  const setsToProcess = targetName
    ? PLAYER_SETS.filter(s => s.name.toLowerCase().includes(targetName.toLowerCase()))
    : PLAYER_SETS;

  if (!setsToProcess.length) {
    console.log('No matching sets found. Available:');
    PLAYER_SETS.forEach(s => console.log(' -', s.name));
    process.exit(1);
  }

  const state = loadState();
  const sportsDb = JSON.parse(readFileSync(SPORTS_DB_PATH, 'utf8'));
  const playersDb = JSON.parse(readFileSync(PLAYERS_DB_PATH, 'utf8'));
  const sets = sportsDb.sets ?? sportsDb;
  const players = playersDb.players ?? playersDb;

  const proxies = loadProxies();
  console.log(`Proxy pool: ${proxies.length} (reliable: Evomi+ISP preferred)`);

  // Helper: open fresh browser+page with a new random proxy per set
  async function openBrowser() {
    const proxy = randomProxy(proxies);
    if (proxy) console.log(`  proxy: ${proxy.server}`);
    const browser = await chromium.launch({ headless: true, proxy: proxy || undefined });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1366, height: 900 },
      proxy: proxy || undefined,
    });
    const page = await ctx.newPage();
    await page.goto('https://www.ebay.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);
    return { browser, page };
  }

  let totalChaseCards = 0;
  let totalPlayersMatched = 0;

  for (const setMeta of setsToProcess) {
    const { name: setName, sport } = setMeta;
    console.log(`\n[${setName}]`);

    // Find set record in DB
    const setKey = Object.keys(sets).find(k =>
      (sets[k].name ?? k).toLowerCase() === setName.toLowerCase()
    );

    if (!setKey) {
      console.log(`  ✗ Not found in DB, skipping`);
      continue;
    }
    const setRecord = sets[setKey];

    // Scrape eBay for chase cards (fresh browser+proxy per set)
    console.log(`  → scraping eBay sold listings...`);
    const { browser: setBrowser, page: setPage } = await openBrowser();
    const listings = await scrapeChaseCards(setName, setPage);
    await setBrowser.close();
    console.log(`  → ${listings.length} unique listings found`);

    if (!listings.length) {
      console.log(`  ✗ No listings, skipping`);
      continue;
    }

    // Parse chase cards
    const chaseCards = parseChaseCards(listings, setName);
    console.log(`  → ${chaseCards.length} chase cards identified`);

    // Write to set DB
    if (!setRecord.cards) setRecord.cards = {};
    setRecord.cards.chaseCards = chaseCards.map(c => ({
      player: c.player,
      cardType: c.cardType,
      printRun: c.printRun,
      price: c.price,
      variant: c.variant ?? null,
      team: c.team ?? null,
      teamYear: c.teamYear ?? null,
      collab: c.collab ?? null,
      graded: c.graded ?? null,
      setCode: c.setCode ?? null,
      rawTitle: c.rawTitle ?? null,
      star: true,
      source: 'ebay-sold-comps',
      fetchedAt: new Date().toISOString().slice(0, 10),
    }));
    setRecord.cards.chaseTotal = chaseCards.length;
    setRecord.cards.topChasePrice = chaseCards[0]?.price ?? null;
    setRecord.cards.avgChasePrice = chaseCards.length
      ? Math.round(chaseCards.reduce((s, c) => s + c.price, 0) / chaseCards.length)
      : null;
    setRecord.cards.fetchedAt = new Date().toISOString().slice(0, 10);

    totalChaseCards += chaseCards.length;

    // Match players to player DB (all sports)
    {
      let matched = 0;
      for (const card of chaseCards) {
        const playerSlug = matchPlayer(card.player, playersDb);
        if (!playerSlug) continue;

        const player = players[playerSlug];
        if (!player) continue;

        // Add card_type array if not present
        if (!player.cards) player.cards = [];

        // Check if this product+cardType already recorded
        const existing = player.cards.find(c => c.setName === setName && c.cardType === card.cardType);
        if (!existing) {
          player.cards.push({
            setName,
            cardType: card.cardType,
            printRun: card.printRun,
            estPrice: card.price,
            variant: card.variant ?? null,
            team: card.team ?? null,
            teamYear: card.teamYear ?? null,
            collab: card.collab ?? null,
            graded: card.graded ?? null,
            setCode: card.setCode ?? null,
            rawTitle: card.rawTitle ?? null,
            star: card.price > 200,
            source: 'ebay-sold-comps',
            addedAt: new Date().toISOString().slice(0, 10),
          });
        }
        matched++;
      }
      console.log(`  → ${matched} players matched in DB (${sport})`);
      totalPlayersMatched += matched;
    }

    // Save after each set
    const dbToSave = sportsDb.sets ? { ...sportsDb, sets } : sets;
    writeFileSync(SPORTS_DB_PATH, JSON.stringify(dbToSave, null, 2));

    const pDbToSave = playersDb.players ? { ...playersDb, players } : players;
    writeFileSync(PLAYERS_DB_PATH, JSON.stringify(pDbToSave, null, 2));

    console.log(`  ✓ saved`);
    state.done.push({ setName, chaseCount: chaseCards.length, at: new Date().toISOString().slice(0, 10) });
    saveState(state);

    // Throttle between sets
    await new Promise(r => setTimeout(r, 2000));
  }

  // (browsers closed per-set above)

  // Build/update card-pricing-sports.json from all sets
  buildCardPricingDb(sets);

  console.log(`\n======= DONE =======`);
  console.log(`Chase cards added: ${totalChaseCards}`);
  console.log(`Players matched:   ${totalPlayersMatched}`);

  state.lastRun = new Date().toISOString();
  saveState(state);
}

function buildCardPricingDb(sets) {
  const CARD_PRICING_PATH = 'card-pricing-sports.json';
  const existing = existsSync(CARD_PRICING_PATH)
    ? JSON.parse(readFileSync(CARD_PRICING_PATH, 'utf8'))
    : { _meta: { description: 'Individual sports card pricing DB', source: 'ebay-sold-comps', updated: null }, cards: {} };

  for (const [setKey, setRecord] of Object.entries(sets)) {
    const chaseCards = setRecord.cards?.chaseCards ?? [];
    for (const card of chaseCards) {
      const cardKey = `${setKey}::${card.player}::${card.cardType}`.toLowerCase().replace(/\s+/g, '-');
      existing.cards[cardKey] = {
        setKey,
        setName: setRecord.name || setRecord.tcgName || setKey,
        player: card.player,
        cardType: card.cardType,
        printRun: card.printRun ?? null,
        price: card.price,
        variant: card.variant ?? null,
        team: card.team ?? null,
        teamYear: card.teamYear ?? null,
        collab: card.collab ?? null,
        graded: card.graded ?? null,
        setCode: card.setCode ?? null,
        rawTitle: card.rawTitle ?? null,
        star: card.star ?? (card.price > 200),
        source: 'ebay-sold-comps',
        fetchedAt: card.fetchedAt ?? new Date().toISOString().slice(0, 10),
      };
    }
  }

  existing._meta.updated = new Date().toISOString().slice(0, 10);
  existing._meta.count = Object.keys(existing.cards).length;
  writeFileSync(CARD_PRICING_PATH, JSON.stringify(existing, null, 2));
  console.log(`card-pricing-sports.json → ${existing._meta.count} cards`);
}

main().catch(e => { console.error(e); process.exit(1); });
