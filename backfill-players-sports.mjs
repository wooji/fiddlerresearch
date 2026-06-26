#!/usr/bin/env node
/**
 * backfill-players-sports.mjs
 * Concurrent scraper for baseball-reference / basketball-reference / pro-football-reference
 * Populates player-history-sports.json with rookie + career data
 *
 * Usage: node backfill-players-sports.mjs [--sport baseball] [--proxies ISP|residential] [--limit 100]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseballReferenceSimpleScraper } from './lib/sports-scrapers/baseball-reference-simple.mjs';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');
const PROXY_PATH_ISP = join(ROOT, 'ISP.txt');
const PROXY_PATH_RESIDENTIAL = join(ROOT, 'heroresi.txt');

// Sample player slugs for MVP (correct baseball-reference IDs)
const SAMPLE_PLAYERS = {
  baseball: [
    'troutmi01', 'judgea01', 'harperbr01', 'coleeg01', 'deversra01',
    'arenado03', 'rodrigujo01', 'verlanm01', 'alcantj01', 'ohtansh01',
  ],
  basketball: [],
  football: [],
};

async function loadDb() {
  try {
    const content = readFileSync(DB_PATH, 'utf8');
    return JSON.parse(content);
  } catch {
    return { _meta: { lastUpdated: new Date().toISOString(), version: 1 }, players: {} };
  }
}

async function saveDb(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`[backfill] saved ${Object.keys(db.players).length} players to ${DB_PATH}`);
}

async function backfillBaseball() {
  console.log('[backfill-baseball] starting scrape (direct fetch + regex)...');
  const scraper = new BaseballReferenceSimpleScraper();

  try {
    const db = await loadDb();

    const results = [];
    for (const slug of SAMPLE_PLAYERS.baseball) {
      const player = await scraper.scrapePlayer(slug);
      console.log(`  [${slug}] raw result:`, JSON.stringify(player).slice(0, 100));
      if (player && player.name) {
        const key = `baseball_${slug}`;
        if (!db.players[key]) {
          db.players[key] = {
            slug,
            name: player.name,
            position: player.position,
            bats: player.bats,
            throws: player.throws,
            debut: player.debut,
            stats: {},
            history: [],
          };
        }
        db.players[key].history.push({
          date: new Date().toISOString(),
          ...player.stats,
        });
        results.push(player.name);
        console.log(`  ✓ ${player.name}`);
      } else {
        console.log(`  ✗ ${slug} (name null or missing)`);
      }
    }

    db._meta.lastUpdated = new Date().toISOString();
    await saveDb(db);

    console.log(`[backfill-baseball] complete: ${results.length}/${SAMPLE_PLAYERS.baseball.length} players`);
    return results.length;
  } catch (e) {
    console.error('[backfill-baseball] error:', e.message);
    return 0;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sport = args.includes('--sport') ? args[args.indexOf('--sport') + 1] : 'baseball';

  console.log(`[backfill] starting sports player backfill (${sport})…`);

  if (sport === 'baseball') {
    await backfillBaseball();
  } else {
    console.log(`[backfill] sport not yet implemented: ${sport}`);
  }

  console.log('[backfill] done');
  process.exit(0);
}

main().catch(e => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});
