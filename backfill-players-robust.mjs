#!/usr/bin/env node
/**
 * backfill-players-robust.mjs
 * Robust player backfill: handle HTML variants, error logging, append-only
 * Fixes: parser failures, selective nulls, incomplete enumeration
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { PlayerIdEnumerator } from './lib/player-id-enumerator.mjs';
import { ConcurrentPlayerScraper } from './lib/concurrent-player-scraper.mjs';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');
const ERROR_LOG = join(ROOT, 'player-backfill-errors.log');

const log = msg => {
  console.log(msg);
  process.stdout.write(msg + '\n');
};

const logErr = (player, err) => {
  const msg = `[ERROR ${player}] ${err?.message || String(err)}`;
  console.error(msg);
  appendFileSync(ERROR_LOG, msg + '\n');
};

function loadDb() {
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { _meta: { version: 1, updated: new Date().toISOString() }, players: {} };
  }
}

function saveDb(db) {
  db._meta.updated = new Date().toISOString();
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function backfillPlayers(sport = 'baseball', concurrency = 50) {
  log(`[${sport}] starting enumeration...`);

  const enumerator = new PlayerIdEnumerator();
  let playerIds = [];

  try {
    if (sport === 'baseball') {
      playerIds = await enumerator.enumerateBaseballReferencePlayers();
    } else if (sport === 'basketball') {
      playerIds = await enumerator.enumerateBasketballReferencePlayers();
    } else if (sport === 'football') {
      playerIds = await enumerator.enumerateFootballReferencePlayers();
    }
  } catch (e) {
    logErr(`enumerate-${sport}`, e);
    return 0;
  }

  log(`[${sport}] found ${playerIds.length} player IDs, scraping...`);

  const db = loadDb();
  const scraper = new ConcurrentPlayerScraper(concurrency);

  try {
    const results = await scraper.scrapeMany(playerIds);

    let successCount = 0;
    let nullCount = 0;

    for (const [slug, player] of Object.entries(results)) {
      const key = `${sport}_${slug}`;

      // Skip if already in DB
      if (db.players[key]) continue;

      if (!player || !player.name) {
        nullCount++;
        logErr(slug, new Error('Parser returned null/no-name'));
        // Still store the record so we don't re-scrape it
        db.players[key] = {
          slug,
          name: null,
          position: null,
          source: 'failed-parse',
          history: [{ date: new Date().toISOString(), error: 'parse_failed' }],
        };
        continue;
      }

      // Valid record
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
        stats: player.stats || {},
        history: [{ date: new Date().toISOString() }],
      };

      successCount++;

      if (successCount % 50 === 0) {
        log(`[${sport}] ✓ ${successCount}, ✗ ${nullCount}`);
      }
    }

    saveDb(db);
    log(`[${sport}] DONE: ${successCount} valid, ${nullCount} parse-failed`);
    return successCount;
  } catch (e) {
    logErr(`scrape-${sport}`, e);
    return 0;
  }
}

async function main() {
  log('[players] starting robust backfill...');
  log('[players] errors logged to: ' + ERROR_LOG);

  const sports = ['baseball'];
  let totalAdded = 0;

  for (const sport of sports) {
    const count = await backfillPlayers(sport, 50);
    totalAdded += count;
  }

  log(`\n[players] COMPLETE: ${totalAdded} players added`);
  process.exit(0);
}

main().catch(e => {
  logErr('MAIN', e);
  process.exit(1);
});
