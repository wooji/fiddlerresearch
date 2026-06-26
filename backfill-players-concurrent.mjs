#!/usr/bin/env node
/**
 * backfill-players-concurrent.mjs
 * 50 concurrent workers + ISP/residential proxy round-robin via curl
 * Fixes: proxy actually used, concurrent scraping, no rate limiting
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { PlayerIdEnumerator } from './lib/player-id-enumerator.mjs';
import { BaseballReferenceSimpleScraper } from './lib/sports-scrapers/baseball-reference-simple.mjs';

const ROOT = '.';
const DB_PATH = join(ROOT, 'player-history-sports.json');
const ERROR_LOG = join(ROOT, 'player-concurrent-errors.log');

const log = msg => {
  console.log(msg);
  process.stdout.write(msg + '\n');
};

function loadProxies(file) {
  try {
    return readFileSync(join(ROOT, file), 'utf8').split('\n').map(l => l.trim()).filter(l => l);
  } catch {
    return [];
  }
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

class ProxyCurlScraper {
  constructor() {
    this.isps = loadProxies('ISP.txt');
    this.residential = loadProxies('heroresi.txt');
    this.allProxies = [...this.isps, ...this.residential];
    this.proxyIdx = 0;
    this.scraper = new BaseballReferenceSimpleScraper();
  }

  getProxyUrl(proxy) {
    const [host, port, user, pass] = proxy.split(':');
    return `http://${user}:${pass}@${host}:${port}`;
  }

  async scrapeWithCurl(url) {
    if (this.allProxies.length === 0) return null;

    const proxy = this.allProxies[this.proxyIdx % this.allProxies.length];
    this.proxyIdx++;
    const proxyUrl = this.getProxyUrl(proxy);

    try {
      const html = execSync(`curl -s -x "${proxyUrl}" -m 20 "${url}"`, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });

      return html;
    } catch (e) {
      return null;
    }
  }

  async scrapePlayerWithRetry(slug) {
    const url = `https://www.baseball-reference.com/players/${slug[0].toLowerCase()}/${slug}.shtml`;

    // Try curl + proxy first
    let html = await this.scrapeWithCurl(url);
    if (!html) {
      // Fallback: direct fetch
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 15000,
        });
        if (response.ok) html = await response.text();
      } catch {}
    }

    if (!html) return null;

    try {
      return this.scraper.parsePlayerPage(html);
    } catch {
      return null;
    }
  }
}

class ConcurrentPool {
  constructor(concurrency, scraper) {
    this.concurrency = concurrency;
    this.scraper = scraper;
    this.queue = [];
    this.running = 0;
  }

  async scrapeMany(slugs) {
    return new Promise(resolve => {
      const results = {};
      let completed = 0;

      const process = async () => {
        while (this.queue.length > 0 && this.running < this.concurrency) {
          this.running++;
          const slug = this.queue.shift();

          try {
            const player = await this.scraper.scrapePlayerWithRetry(slug);
            results[slug] = player;

            if ((completed + 1) % 25 === 0) {
              log(`  ✓ ${completed + 1} / ${slugs.length}`);
            }
          } catch (e) {
            results[slug] = null;
          }

          completed++;
          this.running--;

          if (completed === slugs.length) {
            resolve(results);
          } else {
            process();
          }
        }
      };

      this.queue = slugs.slice();
      for (let i = 0; i < this.concurrency; i++) {
        process();
      }
    });
  }
}

async function backfillPlayers() {
  log('[concurrent] starting 50-worker player backfill with proxies...');

  const enumerator = new PlayerIdEnumerator();
  const playerIds = await enumerator.enumerateBaseballReferencePlayers();

  log(`[concurrent] enumerated ${playerIds.length} players, scraping...`);

  const db = loadDb();
  const scraper = new ProxyCurlScraper();
  const pool = new ConcurrentPool(50, scraper);

  log(`[concurrent] proxies available: ${scraper.allProxies.length} (${scraper.isps.length} ISP + ${scraper.residential.length} residential)`);

  const results = await pool.scrapeMany(playerIds);

  let successCount = 0;
  for (const [slug, player] of Object.entries(results)) {
    const key = `baseball_${slug}`;
    if (db.players[key]) continue;

    if (player && player.name) {
      db.players[key] = {
        slug,
        name: player.name,
        position: player.position,
        bats: player.bats,
        throws: player.throws,
        debut: player.debut,
        draft: player.draft,
        awards: player.awards,
        stats: player.stats || {},
        history: [{ date: new Date().toISOString() }],
      };
      successCount++;
    }
  }

  saveDb(db);
  log(`[concurrent] COMPLETE: ${successCount} players added (${Object.keys(db.players).length} total)`);
}

backfillPlayers().catch(e => {
  log(`[FATAL] ${e.message}`);
  appendFileSync(ERROR_LOG, e.stack + '\n');
  process.exit(1);
});
