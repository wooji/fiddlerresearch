#!/usr/bin/env node
/**
 * enum-basketball.mjs
 * Enumerate all basketball-reference.com players and add to player-history-sports.json
 *
 * Strategy: Fetch the player list pages (a-z index), extract slugs
 * Usage: node enum-basketball.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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
  console.log(`[enum-basketball] saved ${Object.keys(db.players).length} total players`);
}

async function fetchPlayerIndexPage(letter) {
  const url = `https://www.basketball-reference.com/players/${letter}/`;
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
    // Extract player links: <a href="/players/a/abdulka01.html">Kareem Abdul-Jabbar</a>
    const slugMatches = html.match(/<a href="\/players\/[a-z]\/([a-z0-9]+)\.html">/gi) || [];
    const slugs = slugMatches.map(m => m.match(/\/players\/[a-z]\/([a-z0-9]+)\.html/i)[1]);

    console.log(`  [${letter}] found ${slugs.length} players`);
    return slugs;
  } catch (e) {
    console.error(`  [${letter}] error: ${e.message}`);
    return [];
  }
}

async function main() {
  console.log('[enum-basketball] starting enumeration...');

  const db = loadDb();
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let totalAdded = 0;

  for (const letter of letters) {
    const slugs = await fetchPlayerIndexPage(letter);
    for (const slug of slugs) {
      const key = `basketball_${slug}`;
      if (!db.players[key]) {
        db.players[key] = {
          slug,
          sport: 'basketball',
          name: null,
          position: null,
        };
        totalAdded++;
      }
    }

    // Throttle to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  db._meta.lastUpdated = new Date().toISOString();
  saveDb(db);

  console.log(`[enum-basketball] COMPLETE: added ${totalAdded} new basketball players`);
}

main().catch(e => {
  console.error('[enum-basketball] FATAL:', e.message);
  process.exit(1);
});
