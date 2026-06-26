#!/usr/bin/env node
/**
 * rebuild-players-direct.mjs
 * Scrape player details using direct curl (no proxies)
 * Lower concurrency (10 workers) to avoid overwhelming site
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');
const CONCURRENCY = 10; // Much lower than 100
const THROTTLE_MS = 200; // Delay between requests

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
    position: null,
    bats: null,
    throws: null,
    height: null,
    weight: null,
    born_date: null,
    draft: null,
    rookie_year: null,
    stats: {},
  };

  // Name - extract from h1 span
  const nameMatch = html.match(/<h1[^>]*>.*?<span[^>]*>(.*?)<\/span>/s);
  if (nameMatch) player.name = nameMatch[1].replace(/<[^>]+>/g, '').trim().split('\n')[0];

  // Position - extract from Position label + next word(s)
  const posBlock = html.match(/<strong>Position[^<]*<\/strong>\s*([\w\s\/]+)/i);
  if (posBlock && posBlock[1]) {
    player.position = posBlock[1].trim().split(/\s+/)[0];
  }

  // Bats/Throws
  const batsBlock = html.match(/<strong>Bats[^>]*<\/strong>\s*([LR])/i);
  if (batsBlock) player.bats = batsBlock[1];
  const throwsBlock = html.match(/<strong>Throws[^>]*<\/strong>\s*([LR])/i);
  if (throwsBlock) player.throws = throwsBlock[1];

  // Height/Weight - JSON-LD
  const jsonLd = html.match(/"height":\s*\{[^}]*"value":\s*"([^"]+)"/i);
  if (jsonLd && jsonLd[1]) player.height = jsonLd[1];
  const weightLd = html.match(/"weight":\s*\{[^}]*"value":\s*"([^"]+)"/i);
  if (weightLd && weightLd[1]) player.weight = weightLd[1];

  // Born date - JSON-LD
  const bornLd = html.match(/"birthDate":\s*"([^"]+)"/i);
  if (bornLd) player.born_date = bornLd[1];

  // Draft/Rookie from clean text
  const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const draftMatch = cleanText.match(/Draft[:\s]+(\d{4})[^(]*\(\s*[Rr]ound\s+(\d+)[^P]*[Pp]ick\s+(\d+)/i);
  if (draftMatch) {
    player.draft = { year: parseInt(draftMatch[1]), round: parseInt(draftMatch[2]), pick: parseInt(draftMatch[3]) };
    player.rookie_year = parseInt(draftMatch[1]);
  }

  if (!player.rookie_year) {
    const debutMatch = cleanText.match(/Debut[:\s]+([A-Za-z]+\s+\d+,\s+(\d{4}))/i);
    if (debutMatch) {
      player.rookie_year = parseInt(debutMatch[2]);
    }
  }

  return player;
}

async function scrapePlayerDetails(sport, slug) {
  const domain = sport === 'baseball' ? 'baseball-reference.com' :
                 sport === 'basketball' ? 'basketball-reference.com' :
                 'pro-football-reference.com';
  const url = `https://www.${domain}/players/${slug[0].toLowerCase()}/${slug}.shtml`;

  try {
    const html = execSync(`curl -s "${url}" --max-time 10 --connect-timeout 5`, { encoding: 'utf8' });
    if (!html || html.length < 100) return null;
    return parsePlayerPage(html);
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log(`[rebuild-direct] ${CONCURRENCY} workers, direct curl, throttle ${THROTTLE_MS}ms`);

  const db = loadDb();
  const playerQueue = Object.entries(db.players)
    .filter(([key, rec]) => !rec.name) // Only NULL-name players
    .map(([key, rec]) => ({ sport: rec.sport || 'baseball', slug: rec.slug, key }));

  console.log(`[rebuild-direct] queued ${playerQueue.length} NULL-name players`);

  let completed = 0;
  let running = 0;
  let lastSave = 0;

  return new Promise((resolve) => {
    const queue = [...playerQueue];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        running++;
        try {
          const player = await scrapePlayerDetails(item.sport, item.slug);
          if (player && player.name) {
            db.players[item.key] = {
              slug: item.slug,
              sport: item.sport,
              ...player,
              history: [{ date: new Date().toISOString() }],
            };
            completed++;
            if (completed % 10 === 1) console.log(`  ↳ [${item.sport}] ${item.slug}: ${player.name}`);
            if (completed > 0 && completed % 50 === 0) {
              console.log(`  ✓ ${completed}/${playerQueue.length} players`);
              saveDb(db);
              lastSave = completed;
            }
          }
        } catch (e) {
          // Silent fail
        }

        // Throttle between requests
        await new Promise(r => setTimeout(r, THROTTLE_MS));

        running--;
        if (queue.length === 0 && running === 0) {
          saveDb(db);
          console.log(`[rebuild-direct] COMPLETE: ${completed} players with full details`);
          resolve();
        }
      }
    };

    // Start workers
    for (let i = 0; i < CONCURRENCY; i++) {
      worker();
    }
  });
}

main().catch(e => {
  console.error('[rebuild-direct] FATAL:', e.message);
  process.exit(1);
});
