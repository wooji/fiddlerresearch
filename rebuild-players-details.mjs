#!/usr/bin/env node
/**
 * rebuild-players-details.mjs
 * Scrape 23,506 player details: name, stats, injuries, draft, rookie year, current year averages
 * 50 concurrent workers with proxy rotation
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');

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
    position: null,
    bats: null,
    throws: null,
    height: null,
    weight: null,
    born_date: null,
    draft: null,
    rookie_year: null,
    current_year_avg: null,
    career_avg: null,
    stats: {},
    injuries: [],
  };

  // Name - extract from h1 span
  const nameMatch = html.match(/<h1[^>]*>.*?<span[^>]*>(.*?)<\/span>/s);
  if (nameMatch) player.name = nameMatch[1].replace(/<[^>]+>/g, '').trim().split('\n')[0];

  // Position - extract from Position label + next word(s)
  // HTML: <strong>Position:</strong>\n    Centerfielder\n</p>
  const posBlock = html.match(/<strong>Position[^<]*<\/strong>\s*([\w\s\/]+)/i);
  if (posBlock && posBlock[1]) {
    player.position = posBlock[1].trim().split(/\s+/)[0]; // First word after label
  }

  // Bats/Throws - format: <strong>Bats: </strong>Right
  const batsBlock = html.match(/<strong>Bats[^>]*<\/strong>\s*([LR])/i);
  if (batsBlock) player.bats = batsBlock[1];
  const throwsBlock = html.match(/<strong>Throws[^>]*<\/strong>\s*([LR])/i);
  if (throwsBlock) player.throws = throwsBlock[1];

  // Height/Weight - extract from JSON-LD: "height": { "@type": "...", "value": "6-1" }
  const jsonLd = html.match(/"height":\s*\{[^}]*"value":\s*"([^"]+)"/i);
  if (jsonLd && jsonLd[1]) player.height = jsonLd[1];
  const weightLd = html.match(/"weight":\s*\{[^}]*"value":\s*"([^"]+)"/i);
  if (weightLd && weightLd[1]) player.weight = weightLd[1];

  // Born date - from JSON-LD: "birthDate": "1991-08-07"
  const bornLd = html.match(/"birthDate":\s*"([^"]+)"/i);
  if (bornLd) player.born_date = bornLd[1];

  // Clean HTML for text parsing (remove all tags)
  const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Draft: "Draft: 2012 (Round 1, Pick 1 by ...)"
  const draftMatch = cleanText.match(/Draft[:\s]+(\d{4})[^(]*\(\s*[Rr]ound\s+(\d+)[^P]*[Pp]ick\s+(\d+)/i);
  if (draftMatch) {
    player.draft = { year: parseInt(draftMatch[1]), round: parseInt(draftMatch[2]), pick: parseInt(draftMatch[3]) };
    player.rookie_year = parseInt(draftMatch[1]);
  }

  // Rookie year from debut if draft not found: "Debut: April 1, 2018"
  if (!player.rookie_year) {
    const debutMatch = cleanText.match(/Debut[:\s]+([A-Za-z]+\s+\d+,\s+(\d{4}))/i);
    if (debutMatch) {
      player.rookie_year = parseInt(debutMatch[2]);
    }
  }

  // Injuries (from HTML table)
  const injuryMatch = html.match(/Injury Log([\s\S]*?)<\/table>/i);
  if (injuryMatch) {
    const injuries = injuryMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
    player.injuries = injuries.slice(0, 5).map(row => row.replace(/<[^>]+>/g, '').trim()).filter(l => l);
  }

  return player;
}

async function scrapePlayerDetails(sport, slug, proxyIdx, sortedProxies) {
  const proxy = sortedProxies[proxyIdx % sortedProxies.length];
  const proxyUrl = parseProxy(proxy);
  const domain = sport === 'baseball' ? 'baseball-reference.com' :
                 sport === 'basketball' ? 'basketball-reference.com' :
                 'pro-football-reference.com';
  const url = `https://www.${domain}/players/${slug[0].toLowerCase()}/${slug}.shtml`;

  try {
    const html = execSync(`curl -s -x "${proxyUrl}" -m 15 "${url}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!html || html.length < 100) {
      console.error(`  [${slug}] curl returned empty/short response (${html?.length || 0} bytes)`);
      return null;
    }

    return parsePlayerPage(html);
  } catch (e) {
    console.error(`  [${slug}] curl error: ${e.message.slice(0, 80)}`);
    return null;
  }
}

async function main() {
  const concurrency = 100; // Double concurrency for speed
  const isps = loadProxies('ISP.txt');
  const residential = loadProxies('heroresi.txt');
  const proxies = [...isps, ...residential];

  console.log(`[players-details] ${proxies.length} proxies, ${concurrency} concurrent workers, ${proxies.length > 0 ? 'ready' : 'FAILED TO LOAD PROXIES'}`);

  const db = loadDb();
  // Build queue with {sport, slug, key} for each player — skip if already has name
  const playerQueue = Object.entries(db.players)
    .filter(([key, rec]) => !rec.name) // Only queue NULL-name players
    .map(([key, rec]) => ({
      sport: rec.sport || 'baseball',
      slug: rec.slug,
      key: key,
    }));

  let proxyIdx = 0;
  let completed = 0;
  let running = 0;

  const sortedProxies = [...isps, ...residential];

  return new Promise((resolve) => {
    const queue = [...playerQueue];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        running++;
        try {
          const player = await scrapePlayerDetails(item.sport, item.slug, proxyIdx++, sortedProxies);
          if (player && player.name) {
            db.players[item.key] = {
              slug: item.slug,
              sport: item.sport,
              ...player,
              history: [{ date: new Date().toISOString() }],
            };
            completed++;
            if (completed % 10 === 1) console.log(`  ↳ [${item.sport}] ${item.slug}: ${player.name}`);
          }

          if (completed > 0 && completed % 50 === 0) {
            console.log(`  ✓ ${completed}/${playerSlugs.length} players`);
            saveDb(db);
          }
        } catch (e) {
          console.error(`  error on ${slug}:`, e.message);
        }
        running--;

        if (queue.length === 0 && running === 0) {
          saveDb(db);
          console.log(`[players-details] COMPLETE: ${completed} players with full details`);
          resolve();
        }
      }
    };

    // Start 50 workers
    for (let i = 0; i < concurrency; i++) {
      worker();
    }
  });
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
