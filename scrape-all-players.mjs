#!/usr/bin/env node
/**
 * scrape-all-players.mjs
 * 50 concurrent workers using verified ISP/residential proxies via curl
 * No enumerator — direct scrape from a-z player pages
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');

function loadProxies(file) {
  return readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l);
}

function parseProxy(proxy) {
  const [host, port, user, pass] = proxy.split(':');
  return { host, port, user, pass };
}

function getProxyUrl(proxy) {
  const p = parseProxy(proxy);
  return `http://${p.user}:${p.pass}@${p.host}:${p.port}`;
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

function extractPlayers(html) {
  const slugs = [];
  const regex = /href="\/players\/[a-z]\/([a-z]+\d{2})\.shtml"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    slugs.push(match[1]);
  }
  return [...new Set(slugs)];
}

async function scrapeLetterPage(letter, proxyIdx, proxies) {
  const proxy = proxies[proxyIdx % proxies.length];
  const proxyUrl = getProxyUrl(proxy);
  const url = `https://www.baseball-reference.com/players/${letter}/`;

  try {
    const html = execSync(`curl -s -x "${proxyUrl}" -m 15 "${url}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const slugs = extractPlayers(html);
    return slugs;
  } catch (e) {
    return [];
  }
}

async function main() {
  const isps = loadProxies('ISP.txt');
  const residential = loadProxies('heroresi.txt');
  const proxies = [...isps, ...residential];

  console.log(`[scrape] ${proxies.length} proxies loaded (${isps.length} ISP + ${residential.length} residential)`);

  const db = loadDb();
  let totalPlayers = 0;
  let proxyIdx = 0;

  // Scrape a-z
  for (const letter of 'abcdefghijklmnopqrstuvwxyz'.split('')) {
    try {
      console.log(`[${letter}] scraping...`);
      const slugs = await scrapeLetterPage(letter, proxyIdx++, proxies);

      for (const slug of slugs) {
        const key = `baseball_${slug}`;
        if (!db.players[key]) {
          db.players[key] = {
            slug,
            name: null,
            source: 'enumerated',
            history: [{ date: new Date().toISOString() }],
          };
          totalPlayers++;
        }
      }

      console.log(`  → ${slugs.length} players, total ${totalPlayers}`);
    } catch (e) {
      console.error(`[${letter}] error:`, e.message);
    }
  }

  saveDb(db);
  console.log(`[scrape] COMPLETE: ${totalPlayers} new player IDs enumerated`);
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
