#!/usr/bin/env node
/**
 * backfill-player-stats.mjs — Deepen player records with stats/bio from baseball-reference
 * Fills: bats, throws, height, weight, born_date, draft, career_avg, career_hr, career_g
 * Uses proxy rotation (same as backfill-proxies.mjs).
 * Run: nohup node backfill-player-stats.mjs > backfill-player-stats.log 2>&1 &
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DB_PATH   = 'player-history-sports.json';
const ISP_FILE  = 'ISP.txt';
const RESI_FILE = 'heroresi.txt';
const SAVE_EVERY = 50;

function loadDb()    { return JSON.parse(readFileSync(DB_PATH, 'utf8')); }
function saveDb(db)  { writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function loadProxies() {
  return [
    ...readFileSync(ISP_FILE,  'utf8').split('\n'),
    ...readFileSync(RESI_FILE, 'utf8').split('\n'),
  ].filter(l => l.trim()).map(p => {
    const [host, port, user, pass] = p.trim().split(':');
    return `http://${user}:${pass}@${host}:${port}`;
  });
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function getUrl(sport, slug) {
  const domain = sport === 'baseball'    ? 'baseball-reference.com'
               : sport === 'basketball'  ? 'basketball-reference.com'
               :                          'pro-football-reference.com';
  return `https://www.${domain}/players/${slug[0].toLowerCase()}/${slug}.shtml`;
}

function fetchWithProxy(url, proxyUrl) {
  try {
    return execSync(
      `curl -s -x "${proxyUrl}" -A "${UA}" -H "Accept: text/html" -L --max-time 18 --connect-timeout 7 --compressed "${url}"`,
      { encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 24000 }
    ) || '';
  } catch { return ''; }
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function parseText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
}

function extractBats(html)    { return html.match(/Bats:\s*([A-Za-z-]+)/)?.[1] ?? null; }
function extractThrows(html)  { return html.match(/Throws:\s*([A-Za-z-]+)/)?.[1] ?? null; }
function extractHeight(html)  {
  const m = html.match(/(\d+)-(\d+),\s*(\d+)lb/);
  return m ? `${m[1]}'${m[2]}"` : null;
}
function extractWeight(html)  { return parseInt(html.match(/(\d+)lb/)?.[1] ?? '') || null; }
function extractBorn(html)    { return html.match(/Born:\s*([\w]+ \d+, \d{4})/)?.[1] ?? null; }
function extractDraft(html)   {
  const m = html.match(/Draft:\s*([^\n<]{5,80})/);
  return m ? m[1].trim().replace(/\s+/g,' ') : null;
}

// Baseball stats
function parseBaseballStats(text) {
  // Career batting average from the career totals row
  const avgMatch = text.match(/Career\s+[\d,]+\s+[\d,]+\s+(0\.\d{3})/);
  const hrMatch  = text.match(/Career\s+[\d,]+\s+[\d,]+\s+0\.\d{3}\s+[\d,]+\s+[\d,]+\s+([\d,]+)/);
  return {
    career_avg: avgMatch ? parseFloat(avgMatch[1]) : null,
    career_hr:  hrMatch  ? parseInt(hrMatch[1].replace(',','')) : null,
  };
}

// Basketball stats
function parseBasketballStats(text) {
  const ptsMatch = text.match(/Career\s+[\d.]+\s+[\d.]+\s+([\d.]+)\s+[\d.]+/);
  return { career_ppg: ptsMatch ? parseFloat(ptsMatch[1]) : null };
}

function parsePlayerPage(html, sport) {
  if (!html || html.length < 1000) return null;
  const text = parseText(html);
  const bio = {
    bats:       extractBats(text),
    throws:     extractThrows(text),
    height:     extractHeight(text),
    weight:     extractWeight(text),
    born_date:  extractBorn(text),
    draft:      extractDraft(text),
  };
  const stats = sport === 'baseball'   ? parseBaseballStats(text)
              : sport === 'basketball' ? parseBasketballStats(text)
              : {};
  // Remove all-null bio fields
  Object.keys(bio).forEach(k => { if (!bio[k]) delete bio[k]; });
  Object.keys(stats).forEach(k => { if (!stats[k]) delete stats[k]; });
  const hasData = Object.keys(bio).length + Object.keys(stats).length > 0;
  return hasData ? { ...bio, ...stats } : null;
}

async function main() {
  console.log('[player-stats] starting deep bio/stats backfill');
  const db      = loadDb();
  const proxies = loadProxies();
  console.log(`[player-stats] ${proxies.length} proxies loaded`);

  // Target: named players WITHOUT stats (bats/career_avg still null)
  const targets = Object.entries(db.players)
    .filter(([, r]) => r.name && !r.bats && !r.career_avg && !r.career_ppg)
    .map(([k, r]) => ({ key: k, sport: r.sport || 'baseball', slug: r.slug }))
    .filter(p => p.slug);

  console.log(`[player-stats] ${targets.length} players need stats enrichment`);

  let done = 0, enriched = 0, proxyIdx = 0;

  for (const { key, sport, slug } of targets) {
    const proxy = proxies[proxyIdx % proxies.length]; proxyIdx++;
    const html  = fetchWithProxy(getUrl(sport, slug), proxy);
    const data  = parsePlayerPage(html, sport);

    if (data) {
      Object.assign(db.players[key], data);
      enriched++;
    }
    done++;

    if (done % SAVE_EVERY === 0) {
      saveDb(db);
      console.log(`[player-stats] ${done}/${targets.length} | enriched: ${enriched} | proxy #${proxyIdx}`);
    }
  }

  saveDb(db);
  console.log(`[DONE] ${enriched}/${targets.length} players enriched with bio/stats`);
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
