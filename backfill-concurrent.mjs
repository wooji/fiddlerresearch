#!/usr/bin/env node
/**
 * backfill-concurrent.mjs
 * Concurrent backfill with ISP + residential proxy fallback
 * 10 workers = 6-8 hours → <3 hours
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PlayerIdEnumerator } from './lib/player-id-enumerator.mjs';
import { ConcurrentPlayerScraper } from './lib/concurrent-player-scraper.mjs';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');

async function loadDb() {
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { _meta: { lastUpdated: new Date().toISOString(), version: 1 }, players: {} };
  }
}

async function saveDb(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function enumerateAndBackfillConcurrent(sport, concurrency = 50) {
  console.log(`[backfill-concurrent-${sport}] enumerating all player IDs...`);
  const enumerator = new PlayerIdEnumerator();

  let playerIds = [];
  if (sport === 'baseball') {
    playerIds = await enumerator.enumerateBaseballReferencePlayers();
  } else if (sport === 'basketball') {
    playerIds = await enumerator.enumerateBasketballReferencePlayers();
  } else if (sport === 'football') {
    playerIds = await enumerator.enumerateFootballReferencePlayers();
  }

  console.log(`[backfill-concurrent-${sport}] scraping ${playerIds.length} players (${concurrency} concurrent)...`);

  const db = await loadDb();
  const scraper = new ConcurrentPlayerScraper(concurrency); // configurable workers

  const startTime = Date.now();
  const results = await scraper.scrapeMany(playerIds);

  let successCount = 0;
  for (const [slug, player] of Object.entries(results)) {
    if (player && player.name) {
      const key = `${sport}_${slug}`;
      db.players[key] = {
        slug,
        name: player.name,
        position: player.position,
        bats: player.bats,
        throws: player.throws,
        height: player.height,
        weight: player.weight,
        born_date: player.born_date,
        born_place: player.born_place,
        debut: player.debut,
        draft: player.draft,
        awards: player.awards,
        stats: player.stats,
        history: [{ date: new Date().toISOString() }],
      };
      successCount++;
    }
  }

  db._meta.lastUpdated = new Date().toISOString();
  await saveDb(db);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const hours = (elapsed / 3600).toFixed(1);

  console.log(`[backfill-concurrent-${sport}] complete: ${successCount}/${playerIds.length} in ${hours}h`);
  console.log(`[backfill-concurrent-${sport}] 5 ISP + 5 residential workers active`);
  return successCount;
}

async function main() {
  const args = process.argv.slice(2);
  const sport = args[0] || 'baseball';

  console.log(`[backfill] starting concurrent ${sport} backfill (ISP+resi proxies)…`);
  console.log(`[backfill] target: <3 hours with 10 concurrent workers`);

  const startTime = Date.now();
  await enumerateAndBackfillConcurrent(sport);

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`[backfill] total time: ${(totalTime / 3600).toFixed(1)}h`);
  process.exit(0);
}

main().catch(e => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});
