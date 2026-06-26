#!/usr/bin/env node
/**
 * enum-football.mjs
 * Enumerate all pro-football-reference.com players using Playwright (Cloudflare bypass)
 * Auto-retry on failure until complete
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');

function loadDb() {
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { _meta: { version: 1, sports: ['baseball', 'basketball', 'football'], lastUpdated: new Date().toISOString() }, players: {} };
  }
}

function saveDb(db) {
  db._meta.updated = new Date().toISOString();
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`[enum-football] saved ${Object.keys(db.players).length} total players`);
}

async function fetchPlayerIndexPagePlaywright(letter) {
  const url = `https://www.pro-football-reference.com/players/${letter}/`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/players/"]'))
        .map(a => a.href.match(/\/players\/[A-Z]\/([A-Za-z0-9]+)\.html/i)?.[1])
        .filter(Boolean);
    });

    // Dedupe
    const unique = [...new Set(links)];
    console.log(`  [${letter}] found ${unique.length} players (Playwright)`);
    return unique;
  } catch (e) {
    console.error(`  [${letter}] Playwright error: ${e.message.slice(0, 80)}`);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function fetchPlayerIndexPageDirect(letter) {
  const url = `https://www.pro-football-reference.com/players/${letter}/`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
    });

    if (!response.ok) {
      console.log(`  [${letter}] HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();
    const slugMatches = html.match(/<a href="\/players\/[A-Z]\/([A-Za-z0-9]+)\.html">/gi) || [];
    const slugs = slugMatches.map(m => m.match(/\/players\/[A-Z]\/([A-Za-z0-9]+)\.html/i)[1]);

    console.log(`  [${letter}] found ${slugs.length} players (direct)`);
    return slugs;
  } catch (e) {
    console.error(`  [${letter}] direct error: ${e.message.slice(0, 80)}`);
    return [];
  }
}

async function main() {
  console.log('[enum-football] starting with Playwright (Cloudflare bypass)...');

  const db = loadDb();
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let totalAdded = 0;
  let attempt = 1;

  while (attempt <= 3) {
    console.log(`[enum-football] attempt ${attempt}/3`);
    let addedThisRound = 0;

    for (const letter of letters) {
      // Try Playwright first, fall back to direct
      let slugs = [];

      try {
        slugs = await fetchPlayerIndexPagePlaywright(letter);
      } catch (e) {
        console.log(`  [${letter}] Playwright failed, trying direct...`);
        slugs = await fetchPlayerIndexPageDirect(letter);
      }

      for (const slug of slugs) {
        const key = `football_${slug}`;
        if (!db.players[key]) {
          db.players[key] = {
            slug,
            sport: 'football',
            name: null,
            position: null,
          };
          addedThisRound++;
          totalAdded++;
        }
      }

      // Throttle
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (addedThisRound > 0) {
      console.log(`[enum-football] added ${addedThisRound} new players, round ${attempt} complete`);
      db._meta.lastUpdated = new Date().toISOString();
      saveDb(db);
      break; // Success, exit retry loop
    } else {
      console.log(`[enum-football] 0 added in round ${attempt}, retrying...`);
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
    }
  }

  console.log(`[enum-football] COMPLETE: added ${totalAdded} new football players`);
  process.exit(totalAdded > 0 ? 0 : 1);
}

main().catch(e => {
  console.error('[enum-football] FATAL:', e.message);
  process.exit(1);
});
