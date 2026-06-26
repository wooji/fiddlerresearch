#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DB_PATH = 'player-history-sports.json';

function loadDb() { return JSON.parse(readFileSync(DB_PATH, 'utf8')); }
function saveDb(db) { writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function getUrl(sport, slug) {
  const domain = sport === 'baseball' ? 'baseball-reference.com' :
                 sport === 'basketball' ? 'basketball-reference.com' :
                 'pro-football-reference.com';
  return `https://www.${domain}/players/${slug[0].toLowerCase()}/${slug}.shtml`;
}

function fetchHtml(url) {
  try {
    return execSync(`curl -s -A "Mozilla/5.0" --max-time 10 --connect-timeout 5 "${url}"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    }) || null;
  } catch { return null; }
}

function parseName(html) {
  const match = html.match(/<h1[^>]*>.*?<span[^>]*>(.*?)<\/span>/s);
  if (!match) return null;
  const name = match[1].replace(/<[^>]+>/g, '').trim().split('\n')[0];
  return name && name.length > 1 ? name : null;
}

async function main() {
  console.log('[backfill-simple] starting');
  const db = loadDb();
  const nullPlayers = Object.entries(db.players)
    .filter(([k, r]) => !r.name)
    .map(([k, r]) => ({ key: k, sport: r.sport || 'baseball', slug: r.slug }));

  console.log(`[backfill-simple] ${nullPlayers.length} NULL players`);
  let completed = 0, found = 0;

  for (const { key, sport, slug } of nullPlayers) {
    const html = fetchHtml(getUrl(sport, slug));
    if (html && html.length > 100) {
      const name = parseName(html);
      if (name) {
        db.players[key].name = name;
        db.players[key].history = [{ date: new Date().toISOString() }];
        found++;
        if (found % 50 === 1) console.log(`  ✓ ${found} | ${slug}: ${name}`);
      }
    }
    completed++;
    if (completed % 500 === 0) { console.log(`[${completed}/${nullPlayers.length}] ${found} found`); saveDb(db); }
    await new Promise(r => setTimeout(r, 30));
  }
  saveDb(db);
  console.log(`[DONE] ${found}/${nullPlayers.length}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
