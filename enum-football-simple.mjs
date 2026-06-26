#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DB_PATH = 'player-history-sports.json';
function loadDb() { return JSON.parse(readFileSync(DB_PATH, 'utf8')); }
function saveDb(db) { db._meta.updated = new Date().toISOString(); writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

async function fetchIndex(letter) {
  const url = `https://www.pro-football-reference.com/players/${letter}/`;
  for (let retry = 0; retry < 3; retry++) {
    try {
      const html = execSync(`curl -s -A "Mozilla/5.0" --max-time 15 "${url}"`, {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 20000
      });
      if (html && html.length > 100) {
        const slugs = (html.match(/<a href="\/players\/[A-Z]\/([A-Za-z0-9]+)\.html">/gi) || [])
          .map(m => m.match(/\/players\/[A-Z]\/([A-Za-z0-9]+)\.html/i)[1]);
        console.log(`  [${letter}] ${slugs.length} players`);
        return slugs;
      }
    } catch (e) { }
    await new Promise(r => setTimeout(r, 1000));
  }
  return [];
}

async function main() {
  console.log('[enum-football-simple] starting');
  const db = loadDb();
  let added = 0;

  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const slugs = await fetchIndex(letter);
    for (const slug of slugs) {
      const key = `football_${slug}`;
      if (!db.players[key]) {
        db.players[key] = { slug, sport: 'football', name: null };
        added++;
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }

  saveDb(db);
  console.log(`[DONE] added ${added} football players`);
}

main().catch(e => console.error('ERROR:', e.message));
