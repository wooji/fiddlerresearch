#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const DB_PATH = 'player-history-sports.json';
const ISP_FILE = resolve('/home/user/Desktop/ISP.txt').replace(/\/home\/user/, 'C:/Users/Christopher');
const RESI_FILE = resolve('/home/user/Desktop/heroresi.txt').replace(/\/home\/user/, 'C:/Users/Christopher');
const CONCURRENCY = 18;
const BATCH_SIZE = 200;

function loadDb() { return JSON.parse(readFileSync(DB_PATH, 'utf8')); }
function saveDb(db) { writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function loadProxies() {
  const isp = readFileSync('C:/Users/Christopher/Desktop/ISP.txt', 'utf8').split('\n').filter(l => l.trim());
  const resi = readFileSync('C:/Users/Christopher/Desktop/heroresi.txt', 'utf8').split('\n').filter(l => l.trim());
  console.log(`[proxies] loaded ${isp.length} ISP + ${resi.length} resi = ${isp.length + resi.length} total`);
  return [...isp, ...resi].map(p => {
    const [host, port, user, pass] = p.split(':');
    return `http://${user}:${pass}@${host}:${port}`;
  });
}

function getUrl(sport, slug) {
  const domain = sport === 'baseball' ? 'baseball-reference.com' :
                 sport === 'basketball' ? 'basketball-reference.com' : 'pro-football-reference.com';
  return `https://www.${domain}/players/${slug[0].toLowerCase()}/${slug}.shtml`;
}

function fetchWithProxy(url, proxyUrl) {
  try {
    const html = execSync(`curl -s -x "${proxyUrl}" -A "Mozilla/5.0" --max-time 15 --connect-timeout 5 "${url}"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 20000
    });
    return html && html.length > 100 ? html : null;
  } catch { return null; }
}

function parseName(html) {
  const match = html.match(/<h1[^>]*>[\s\S]{0,200}?<span[^>]*>([\s\S]{0,100}?)<\/span>/);
  if (!match) return null;
  const name = match[1].replace(/<[^>]+>/g, '').trim().split('\n')[0];
  return name && name.length > 1 ? name : null;
}

async function main() {
  console.log(`[backfill-v2] ${CONCURRENCY} concurrent workers, ${BATCH_SIZE}-record async batches`);

  const db = loadDb();
  const proxies = loadProxies();
  const nullPlayers = Object.entries(db.players)
    .filter(([k, r]) => !r.name)
    .map(([k, r]) => ({ key: k, sport: r.sport || 'baseball', slug: r.slug }));

  console.log(`[backfill] ${nullPlayers.length} players queued`);

  let completed = 0, found = 0, proxyIdx = 0;
  const dbBatch = [];

  async function flushDbBatch() {
    if (dbBatch.length === 0) return;
    const batch = [...dbBatch];
    dbBatch.length = 0;

    const freshDb = loadDb();
    batch.forEach(({ key, sport, name }) => {
      freshDb.players[key].name = name;
      freshDb.players[key].sport = sport;
      freshDb.players[key].history = [{ date: new Date().toISOString() }];
    });
    saveDb(freshDb);
    console.log(`  [db-flush] saved ${batch.length} records`);
  }

  const worker = async () => {
    while (nullPlayers.length > 0) {
      const item = nullPlayers.shift();
      if (!item) break;

      const proxy = proxies[proxyIdx % proxies.length];
      proxyIdx++;

      const html = fetchWithProxy(getUrl(item.sport, item.slug), proxy);
      if (html) {
        const name = parseName(html);
        if (name) {
          dbBatch.push({ key: item.key, sport: item.sport, name });
          found++;
          if (found % 100 === 1) console.log(`  ✓ ${found} found`);
        }
      }

      completed++;
      if (dbBatch.length >= BATCH_SIZE) await flushDbBatch();
      if (completed % 500 === 0) console.log(`[${completed}/${nullPlayers.length + completed}] progress`);
    }
  };

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  await flushDbBatch();

  console.log(`[COMPLETE] ${found}/${nullPlayers.length + completed}`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
