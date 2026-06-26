#!/usr/bin/env node
/**
 * scrape-all-sports-players.mjs
 * Enumerate ALL players: baseball, basketball, football
 * 50 concurrent per sport via ISP/residential proxies
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');

const SPORTS = {
  baseball: 'baseball-reference.com',
  basketball: 'basketball-reference.com',
  football: 'pro-football-reference.com',
};

function loadProxies(file) {
  return readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l);
}

function getProxyUrl(proxy) {
  const [host, port, user, pass] = proxy.split(':');
  return `http://${user}:${pass}@${host}:${port}`;
}

function loadDb() {
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { _meta: { version: 1 }, players: {} };
  }
}

function saveDb(db) {
  db._meta.updated = new Date().toISOString();
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function extractPlayers(html, sport) {
  const slugs = [];
  // Different regex per sport
  let regex;
  if (sport === 'baseball') {
    regex = /href="\/players\/[a-z]\/([a-z]+\d{2})\.shtml"/g;
  } else if (sport === 'basketball') {
    regex = /href="\/players\/[a-z]\/([a-z]+\d{2})\.html"/g;
  } else {
    regex = /href="\/players\/[a-z]\/([a-z]+\d{2})\.htm"/g;
  }
  let match;
  while ((match = regex.exec(html)) !== null) {
    slugs.push(match[1]);
  }
  return [...new Set(slugs)];
}

async function scrapeLetterPageRaw(sport, letter, proxyIdx, proxies) {
  const proxy = proxies[proxyIdx % proxies.length];
  const proxyUrl = getProxyUrl(proxy);
  const url = `https://www.${SPORTS[sport]}/players/${letter}/`;

  try {
    const html = execSync(`curl -s -x "${proxyUrl}" -m 15 "${url}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return html;
  } catch (e) {
    return '';
  }
}

async function main() {
  const isps = loadProxies('ISP.txt');
  const residential = loadProxies('heroresi.txt');
  const proxies = [...isps, ...residential];

  console.log(`[sports-enum] ${proxies.length} proxies, enumerating baseball/basketball/football`);

  const db = loadDb();
  let totalPlayers = 0;

  // Enumerate all 3 sports in parallel
  for (const [sport, domain] of Object.entries(SPORTS)) {
    console.log(`\n[${sport}] starting a-z enumeration...`);
    let sportTotal = 0;
    let proxyIdx = 0;

    for (const letter of 'abcdefghijklmnopqrstuvwxyz'.split('')) {
      try {
        const html = await scrapeLetterPageRaw(sport, letter, proxyIdx++, proxies);
        const slugs = extractPlayers(html || '', sport);

        for (const slug of slugs) {
          const key = `${sport}_${slug}`;
          if (!db.players[key]) {
            db.players[key] = {
              slug,
              sport,
              name: null,
              source: 'enumerated',
              history: [{ date: new Date().toISOString() }],
            };
            sportTotal++;
            totalPlayers++;
          }
        }

        console.log(`  [${letter}] ${slugs.length} players, ${sport} total ${sportTotal}`);
      } catch (e) {
        console.error(`  [${letter}] error:`, e.message.slice(0, 80));
      }
    }

    console.log(`[${sport}] COMPLETE: ${sportTotal} new players`);
  }

  saveDb(db);

  // Verify saved
  const final = loadDb();
  const finalCount = Object.keys(final.players).length;
  const sports={};
  Object.values(final.players).forEach(p=>{sports[p.sport||'baseball']=(sports[p.sport||'baseball']||0)+1});
  console.log(`\n[sports-enum] SAVED: ${finalCount} total in DB`);
  console.log('[sports-enum] By sport:', JSON.stringify(sports));
  console.log(`[sports-enum] FINAL: ${totalPlayers} added this run`);
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
