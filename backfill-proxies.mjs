#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DB_PATH = 'player-history-sports.json';
const ISP_FILE = 'ISP.txt';
const RESI_FILE = 'heroresi.txt';

function loadDb() { return JSON.parse(readFileSync(DB_PATH, 'utf8')); }
function saveDb(db) { writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function loadProxies() {
  const isp = readFileSync(ISP_FILE, 'utf8').split('\n').filter(l => l.trim());
  const resi = readFileSync(RESI_FILE, 'utf8').split('\n').filter(l => l.trim());
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

async function fetchWithProxy(url, proxyUrl) {
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
  console.log('[backfill-proxies] starting proxy-rotated backfill');

  const db = loadDb();
  const proxies = loadProxies();
  const nullPlayers = Object.entries(db.players)
    .filter(([k, r]) => !r.name)
    .map(([k, r]) => ({ key: k, sport: r.sport || 'baseball', slug: r.slug }));

  console.log(`[backfill-proxies] ${proxies.length} proxies, ${nullPlayers.length} players`);

  let completed = 0, found = 0, proxyIdx = 0;

  for (const { key, sport, slug } of nullPlayers) {
    const proxy = proxies[proxyIdx % proxies.length];
    proxyIdx++;

    const html = await fetchWithProxy(getUrl(sport, slug), proxy);
    if (html) {
      const name = parseName(html);
      if (name) {
        db.players[key].name = name;
        db.players[key].sport = sport;
        db.players[key].history = [{ date: new Date().toISOString() }];
        found++;
        if (found % 50 === 1) console.log(`  ✓ ${found} | ${slug}: ${name}`);
      }
    }

    completed++;
    if (completed % 100 === 0) {
      console.log(`[${completed}/${nullPlayers.length}] ${found} found, proxy #${proxyIdx}`);
      saveDb(db);
    }

    await new Promise(r => setTimeout(r, 100));
  }

  saveDb(db);
  console.log(`[DONE] ${found}/${nullPlayers.length}`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
