#!/usr/bin/env node
/**
 * NBA + NFL Player Backfill
 * Phase 1: Fill names for 5,416 basketball slugs (fix .html extension)
 * Phase 2: Enumerate NFL slugs from PFR A-Z index
 * Phase 3: Fill NFL player names + stats
 *
 * Usage: node backfill-nba-nfl-players.mjs [--nba-only] [--nfl-only]
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const DB_PATH = 'player-history-sports.json';
const ISP_FILE = 'ISP.txt';
const RESI_FILE = 'heroresi.txt';
const SAVE_INTERVAL = 20; // save every 20 batches × CONCURRENCY players
const CONCURRENCY = 12; // async spawn+tmpfile → true concurrency, no event-loop block

function loadDb() { return JSON.parse(readFileSync(DB_PATH, 'utf8')); }
function saveDb(db) { writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function loadProxies(resiOnly = false) {
  const isp = resiOnly ? [] : readFileSync(ISP_FILE, 'utf8').split('\n').map(l=>l.replace(/\r/,'')).filter(l => l.trim());
  const resi = readFileSync(RESI_FILE, 'utf8').split('\n').map(l=>l.replace(/\r/,'')).filter(l => l.trim());
  return [...isp, ...resi].map(p => {
    const parts = p.split(':');
    // heroresi format: host:port:user:pass
    const [host, port, user, pass] = parts;
    return `http://${user}:${pass}@${host}:${port}`;
  });
}
const proxiesAll = null; // lazy init
const proxiesResi = null;

let _tmpCounter = 0;
function fetchWithProxy(url, proxyUrl) {
  const tmpFile = join(tmpdir(), `bbr_${process.pid}_${_tmpCounter++}.html`);
  return new Promise(resolve => {
    const args = ['-s', '-L', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      '--max-time', '10', '--connect-timeout', '5', '--retry', '0', '--output', tmpFile];
    if (proxyUrl) { args.push('-x'); args.push(proxyUrl); }
    args.push(url);
    const proc = spawn('curl', args, { stdio: 'ignore' }); // no pipe → close fires reliably on Windows
    const timer = setTimeout(() => { try { proc.kill(); } catch {} }, 13000);
    const done = () => {
      clearTimeout(timer);
      try {
        if (!existsSync(tmpFile)) return resolve(null);
        const html = readFileSync(tmpFile, 'utf8');
        try { unlinkSync(tmpFile); } catch {}
        resolve(html && html.length > 10000 ? html : null);
      } catch { resolve(null); }
    };
    proc.on('close', done);
    proc.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

const STAT_WORDS = /percentage|rating|average|points|assists|rebounds|steals|blocks|field goal|turnover|efficiency|salary|draft|year|career|season/i;
// Extract name from BBR/PFR HTML
function parseName(html, sport) {
  // 1. h1 itemprop=name (most precise — player page only)
  const h1Match = html.match(/<h1[^>]*itemprop="name"[^>]*>\s*<span[^>]*>([^<]{3,50})<\/span>/);
  if (h1Match) return h1Match[1].trim();
  // 2. Title tag: "LeBron James Stats..." or "Patrick Mahomes Stats..."
  const titleMatch = html.match(/<title>([^<|]+)/);
  if (titleMatch) {
    const m = titleMatch[1].trim().match(/^([A-Z][a-z'-]+(?:\s+[A-Z][a-z'.-]+){1,3})\s+Stats/);
    if (m && !STAT_WORDS.test(m[1])) return m[1];
  }
  // 3. Strong tag — only if it doesn't look like a stat label
  const strongMatch = html.match(/<strong>([A-Z][a-z'-]+(?:\s+[A-Z][a-z'.-]+){1,3})<\/strong>/);
  if (strongMatch && !STAT_WORDS.test(strongMatch[1])) return strongMatch[1];
  // 4. h1 generic span fallback
  const spanMatch = html.match(/<h1[^>]*>[\s\S]{0,300}?<span[^>]*>([^<]{3,50})<\/span>/);
  if (spanMatch) { const n = spanMatch[1].trim(); if (!STAT_WORDS.test(n)) return n; }
  return null;
}

// Parse additional player info from BBR HTML
function parsePlayerInfo(html, sport) {
  const info = {};
  if (sport === 'basketball') {
    // Position — BBR: "Position: </strong>   Center"
    const posMatch = html.match(/Position:\s*<\/strong>\s*([A-Za-z\s\-\/]{2,30})(?:\s*&#|<|\n)/);
    if (posMatch) info.position = posMatch[1].trim().split(/\s{2,}/)[0].trim();
    // Height/weight — BBR: <span>7-2</span>,&nbsp;<span>225lb</span>
    const hwMatch = html.match(/<span>([\d]+-[\d]+)<\/span>[^<]*<span>([\d]+lb)<\/span>/);
    if (hwMatch) { info.height = hwMatch[1]; info.weight = hwMatch[2]; }
    // Born date — check both formats
    const bornMatch = html.match(/data-birth="([^"]+)"/) || html.match(/itemprop="birthDate"[^>]*>([^<]+)/);
    if (bornMatch) info.born_date = bornMatch[1].trim();
    // Draft — year in /draft/NBA_2003.html link
    const draftYearMatch = html.match(/\/draft\/NBA_(\d{4})\.html/);
    const draftRoundMatch = html.match(/(\d+)(?:st|nd|rd|th) round.*?\((\d+)(?:st|nd|rd|th) pick/i);
    if (draftYearMatch) {
      info.draft = { year: parseInt(draftYearMatch[1]), round: draftRoundMatch ? parseInt(draftRoundMatch[1]) : null, pick: draftRoundMatch ? parseInt(draftRoundMatch[2]) : null };
      info.rookie_year = parseInt(draftYearMatch[1]);
    }
    // Debut date — in <a> tag after "NBA Debut:"
    const debutMatch = html.match(/NBA Debut:[\s\S]{0,50}?>([^<]{5,30})<\/a>/);
    if (debutMatch) info.debut = debutMatch[1].trim();
    // Stats (career)
    const ptsMatch = html.match(/<td.*?data-stat="pts_per_g"[^>]*>(\d+\.?\d*)<\/td>/);
    if (ptsMatch) info.career_pts_per_g = parseFloat(ptsMatch[1]);
  } else if (sport === 'football') {
    const posMatch = html.match(/Position:\s*<\/strong>\s*<span[^>]*>([^<]+)<\/span>/);
    if (posMatch) info.position = posMatch[1].trim();
    const hwMatch = html.match(/<span itemprop="height">([^<]+)<\/span>.*?<span itemprop="weight">([^<]+)<\/span>/s);
    if (hwMatch) { info.height = hwMatch[1].trim(); info.weight = hwMatch[2].trim(); }
    const bornMatch = html.match(/<span itemprop="birthDate" id="necro-birth" data-birth="([^"]+)"/);
    if (bornMatch) info.born_date = bornMatch[1];
    const draftMatch = html.match(/Draft:[\s\S]{0,200}?(\d{4})[^)]*(\d+)(?:st|nd|rd|th) round[^)]*\((\d+)(?:st|nd|rd|th) pick/i);
    if (draftMatch) { info.draft = { year: parseInt(draftMatch[1]), round: parseInt(draftMatch[2]), pick: parseInt(draftMatch[3]) }; info.rookie_year = parseInt(draftMatch[1]); }
    // NFL debut from first season row
    const nflDebutMatch = html.match(/data-stat="year_id"[^>]*>(\d{4})<\/th>/);
    if (nflDebutMatch) info.rookie_year = parseInt(nflDebutMatch[1]);
  }
  return info;
}

// URL by sport (FIXED extension)
function getUrl(sport, slug) {
  if (sport === 'basketball') return `https://www.basketball-reference.com/players/${slug[0].toLowerCase()}/${slug}.html`;
  if (sport === 'football') return `https://www.pro-football-reference.com/players/${slug[0].toUpperCase()}/${slug}.htm`;
  return `https://www.baseball-reference.com/players/${slug[0].toLowerCase()}/${slug}.shtml`;
}

// Enumerate NFL player slugs from PFR A-Z index
async function enumerateNflSlugs(proxies) {
  const slugs = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let proxyIdx = 0;
  for (const letter of letters) {
    const url = `https://www.pro-football-reference.com/players/${letter}/`;
    const proxy = proxies[proxyIdx++ % proxies.length];
    const html = await fetchWithProxy(url, proxy);
    if (!html) { console.log(`  [nfl-enum] ${letter}: failed`); await delay(500); continue; }
    // Extract slugs from href="/players/{L}/{slug}.htm"
    const matches = [...html.matchAll(/href="\/players\/[A-Z]\/([A-Za-z0-9]+)\.htm"/g)];
    const newSlugs = matches.map(m => m[1]);
    slugs.push(...newSlugs);
    console.log(`  [nfl-enum] ${letter}: ${newSlugs.length} players`);
    await delay(1500); // throttle enumeration
  }
  return [...new Set(slugs)]; // dedupe
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const nbaOnly = args.includes('--nba-only');
  const nflOnly = args.includes('--nfl-only');

  const db = loadDb();
  const proxies = loadProxies(false);       // ISP+resi for BBR
  const proxiesNfl = loadProxies(true);     // resi-only for PFR (ISP gets bot-checked)
  console.log(`[nba-nfl] ${proxies.length} proxies (all), ${proxiesNfl.length} resi-only for NFL`);

  // Phase 1: NBA names
  if (!nflOnly) {
    const bballPlayers = Object.entries(db.players)
      .filter(([k, p]) => p.sport === 'basketball' && !p.name)
      .map(([k, p]) => ({ key: k, slug: p.slug }));

    console.log(`\n[Phase 1] NBA name backfill: ${bballPlayers.length} players`);
    let done = 0, found = 0, proxyIdx = 0;

    // Process in batches of CONCURRENCY
    for (let i = 0; i < bballPlayers.length; i += CONCURRENCY) {
      const batch = bballPlayers.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async ({ key, slug }) => {
        const proxy = proxies[proxyIdx++ % proxies.length];
        const url = getUrl('basketball', slug);
        const html = await fetchWithProxy(url, proxy);
        if (html) {
          const name = parseName(html, 'basketball');
          if (name) {
            const info = parsePlayerInfo(html, 'basketball');
            db.players[key] = { ...db.players[key], name, ...info, sport: 'basketball' };
            found++;
            if (found % 100 === 0) console.log(`  [nba] ${found} named | latest: ${name}`);
          }
        }
        done++;
      }));

      // Save every SAVE_INTERVAL batches (use batch index i, not done count)
      const batchNum = Math.floor(i / CONCURRENCY);
      if (batchNum % SAVE_INTERVAL === 0) {
        saveDb(db);
        console.log(`  [nba] saved @ batch ${batchNum} / ${done} players (${found} named)`);
      }
      await delay(300);
    }

    saveDb(db);
    console.log(`[Phase 1] DONE: ${found}/${bballPlayers.length} NBA players named`);
  }

  // Phase 2: Enumerate NFL slugs
  if (!nbaOnly) {
    const existingNfl = Object.values(db.players).filter(p => p.sport === 'football').length;
    console.log(`\n[Phase 2] NFL enumeration (existing: ${existingNfl})`);

    const nflSlugs = await enumerateNflSlugs(proxiesNfl);
    console.log(`[Phase 2] ${nflSlugs.length} NFL slugs found`);

    // Add new slugs to DB
    let added = 0;
    for (const slug of nflSlugs) {
      const key = `football_${slug}`;
      if (!db.players[key]) {
        db.players[key] = { slug, sport: 'football', name: null };
        added++;
      }
    }
    saveDb(db);
    console.log(`[Phase 2] Added ${added} new NFL player stubs`);

    // Phase 3: Fill NFL names
    const nflPlayers = Object.entries(db.players)
      .filter(([k, p]) => p.sport === 'football' && !p.name)
      .map(([k, p]) => ({ key: k, slug: p.slug }));

    console.log(`\n[Phase 3] NFL name backfill: ${nflPlayers.length} players`);
    let nflDone = 0, nflFound = 0, nflProxyIdx = 0;

    for (let i = 0; i < nflPlayers.length; i += CONCURRENCY) {
      const batch = nflPlayers.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async ({ key, slug }) => {
        const proxy = proxiesNfl[nflProxyIdx++ % proxiesNfl.length];
        const url = getUrl('football', slug);
        const html = await fetchWithProxy(url, proxy);
        if (html) {
          const name = parseName(html, 'football');
          if (name) {
            const info = parsePlayerInfo(html, 'football');
            db.players[key] = { ...db.players[key], name, ...info, sport: 'football' };
            nflFound++;
            if (nflFound % 100 === 0) console.log(`  [nfl] ${nflFound} named | latest: ${name}`);
          }
        }
        nflDone++;
      }));

      const nflBatchNum = Math.floor(i / CONCURRENCY);
      if (nflBatchNum % SAVE_INTERVAL === 0) {
        saveDb(db);
        console.log(`  [nfl] saved @ batch ${nflBatchNum} / ${nflDone} players (${nflFound} named)`);
      }
      await delay(200);
    }

    saveDb(db);
    console.log(`[Phase 3] DONE: ${nflFound}/${nflPlayers.length} NFL players named`);
  }

  // Summary
  const final = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  const finalPlayers = final.players ?? final;
  const bySprot = {};
  for (const p of Object.values(finalPlayers)) {
    const s = p.sport ?? 'baseball';
    const named = p.name ? 1 : 0;
    if (!bySprot[s]) bySprot[s] = { total: 0, named: 0 };
    bySprot[s].total++;
    bySprot[s].named += named;
  }
  console.log('\n=== FINAL DB STATE ===');
  for (const [sport, counts] of Object.entries(bySprot)) {
    console.log(`  ${sport}: ${counts.named}/${counts.total} named`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
