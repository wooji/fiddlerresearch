#!/usr/bin/env node
/**
 * backfill-player-ids.mjs
 * Enumerate all player IDs from reference sites + populate database
 * Then run full scraper on valid IDs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PlayerIdEnumerator } from './lib/player-id-enumerator.mjs';
import { BaseballReferenceSimpleScraper } from './lib/sports-scrapers/baseball-reference-simple.mjs';

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
  console.log(`[backfill] saved ${Object.keys(db.players).length} players`);
}

async function enumerateAndBackfill(sport) {
  console.log(`[backfill-${sport}] enumerating all player IDs...`);
  const enumerator = new PlayerIdEnumerator();

  let playerIds = [];
  if (sport === 'baseball') {
    playerIds = await enumerator.enumerateBaseballReferencePlayers();
  } else if (sport === 'basketball') {
    playerIds = await enumerator.enumerateBasketballReferencePlayers();
  } else if (sport === 'football') {
    playerIds = await enumerator.enumerateFootballReferencePlayers();
  }

  console.log(`[backfill-${sport}] scraping ${playerIds.length} players...`);

  const db = await loadDb();
  const scraper = new BaseballReferenceSimpleScraper(); // reuse for now
  let scrapedCount = 0;
  let successCount = 0;

  // Scrape in batches of 50 (rate-limit friendly)
  const batchSize = 50;
  for (let i = 0; i < playerIds.length; i += batchSize) {
    const batch = playerIds.slice(i, i + batchSize);

    for (const slug of batch) {
      scrapedCount++;
      const player = await scraper.scrapePlayer(slug);

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
        if (successCount % 10 === 0) console.log(`  ${successCount}/${scrapedCount} success`);
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
    }

    db._meta.lastUpdated = new Date().toISOString();
    await saveDb(db);
    console.log(`  batch ${Math.ceil((i + batchSize) / batchSize)}/${Math.ceil(playerIds.length / batchSize)} complete`);
  }

  console.log(`[backfill-${sport}] complete: ${successCount}/${playerIds.length} scraped successfully`);
  return successCount;
}

async function main() {
  const args = process.argv.slice(2);
  const sport = args[0] || 'baseball';
  const limit = args[1] ? parseInt(args[1]) : null;

  console.log(`[backfill] starting ${sport} player ID enumeration + backfill…`);
  console.log(`[backfill] ${limit ? `limited to ${limit} players` : 'full enumeration'}`);

  await enumerateAndBackfill(sport);

  console.log('[backfill] done');
  process.exit(0);
}

main().catch(e => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});
