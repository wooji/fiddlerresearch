#!/usr/bin/env node
/**
 * scrape-sport-details.mjs <sport>
 * Scrape one sport: baseball | basketball | football
 * 50 concurrent workers
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');
const SPORT = process.argv[2] || 'baseball';

const DOMAIN = SPORT === 'baseball' ? 'baseball-reference.com' :
              SPORT === 'basketball' ? 'basketball-reference.com' :
              'pro-football-reference.com';

const EXT = SPORT === 'baseball' ? '.shtml' :
            SPORT === 'basketball' ? '.html' : '.htm';

function loadProxies(file) {
  return readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l);
}

function parseProxy(proxy) {
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

function parsePlayerPage(html) {
  const player = {
    name: null,
    bats: null,
    throws: null,
    rookie_year: null,
  };

  // Name
  const nameMatch = html.match(/<h1[^>]*>.*?<span[^>]*>(.*?)<\/span>/s);
  if (nameMatch) player.name = nameMatch[1].replace(/<[^>]+>/g, '').trim().split('\n')[0];

  // Bats/Throws - format: <strong>Bats: </strong>Right (baseball only)
  const batsBlock = html.match(/<strong>Bats[^>]*<\/strong>\s*([LR])/i);
  if (batsBlock) player.bats = batsBlock[1];
  const throwsBlock = html.match(/<strong>Throws[^>]*<\/strong>\s*([LR])/i);
  if (throwsBlock) player.throws = throwsBlock[1];

  // Rookie year from debut: "Debut: April 1, 2011"
  const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const debutMatch = cleanText.match(/Debut[:\s]+([A-Za-z]+\s+\d+,\s+(\d{4}))/i);
  if (debutMatch) {
    player.rookie_year = parseInt(debutMatch[2]);
  }

  return player;
}

async function scrapePlayerWithProxy(slug, proxyIdx, proxies) {
  const proxy = proxies[proxyIdx % proxies.length];
  const proxyUrl = parseProxy(proxy);
  const url = `https://www.${DOMAIN}/players/${slug[0].toLowerCase()}/${slug}${EXT}`;

  try {
    const html = execSync(`curl -s -x "${proxyUrl}" -m 10 "${url}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!html || html.length < 100) return null;
    return parsePlayerPage(html);
  } catch (e) {
    return null;
  }
}

async function main() {
  const isps = loadProxies('ISP.txt');
  const residential = loadProxies('heroresi.txt');
  const proxies = [...isps, ...residential];

  console.log(`[${SPORT}] 50 concurrent workers, ${proxies.length} proxies`);

  const db = loadDb();
  const playerQueue = Object.entries(db.players)
    .filter(([_, p]) => p.sport === SPORT)
    .map(([key, p]) => ({ key, slug: p.slug }));

  console.log(`[${SPORT}] ${playerQueue.length} players to scrape`);

  if (playerQueue.length === 0) {
    console.log(`[${SPORT}] no players found for this sport`);
    process.exit(0);
  }

  const concurrency = 50;
  let proxyIdx = 0;
  let completed = 0;
  let running = 0;

  return new Promise((resolve) => {
    const queue = [...playerQueue];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        running++;
        try {
          const player = await scrapePlayerWithProxy(item.slug, proxyIdx++, proxies);
          if (player && player.name) {
            db.players[item.key] = {
              slug: item.slug,
              sport: SPORT,
              name: player.name,
              bats: player.bats,
              throws: player.throws,
              rookie_year: player.rookie_year,
              history: [{ date: new Date().toISOString() }],
            };
            completed++;
            if (completed % 25 === 1) console.log(`  [${SPORT}] ${completed}/${playerQueue.length}`);
          }

          if (completed % 100 === 0 && completed > 0) saveDb(db);
        } catch (e) {
          // continue
        }
        running--;

        if (queue.length === 0 && running === 0) {
          saveDb(db);
          console.log(`[${SPORT}] COMPLETE: ${completed}/${playerQueue.length} scraped`);
          resolve();
        }
      }
    };

    for (let i = 0; i < concurrency; i++) {
      worker();
    }
  });
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
