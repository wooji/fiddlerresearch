#!/usr/bin/env node
/**
 * pokemon-prerelease-scout.mjs
 * Fast prerelease product stub generator — replaces ~40 tool calls with 1 script.
 * Outputs ready-to-paste fiddler-research.mjs product entry.
 *
 * Usage:
 *   node pokemon-prerelease-scout.mjs "30th celebration etb"
 *   node pokemon-prerelease-scout.mjs "pitch black booster box"
 *   node pokemon-prerelease-scout.mjs "me05 elite trainer"
 */

import { execFileSync, execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const TCGCSV_UA = 'jester-researcher/1.0.0';
const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer/3';
const YTDLP = 'C:/Users/Christopher/AppData/Local/Programs/Python/Python313/python';

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Usage: node pokemon-prerelease-scout.mjs "<product query>"');
  process.exit(1);
}

function curl(url, opts = []) {
  try {
    return execFileSync('curl', ['-s', url, '-A', TCGCSV_UA, '--max-time', '20', '--compressed', ...opts], {
      encoding: 'utf8', maxBuffer: 50e6
    });
  } catch { return null; }
}

function parseCsv(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"' && text[i+1] === '"') { field += '"'; i++; } else if (c === '"') inQ = false; else field += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { row.push(field); field = ''; } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else if (c !== '\r') field += c; }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function fuzzyScore(name, q) {
  const n = name.toLowerCase(), terms = q.toLowerCase().split(/\s+/);
  return terms.filter(t => n.includes(t)).length / terms.length;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ytdlpSearch(searchQuery, count = 8) {
  try {
    const out = execFileSync(YTDLP, [
      '-m', 'yt_dlp', '--js-runtimes', 'node',
      '--print', '%(id)s|%(title)s|%(description)s',
      '--no-playlist', `ytsearch${count}:${searchQuery}`
    ], { encoding: 'utf8', maxBuffer: 2e6, timeout: 30000 });
    return out.trim().split('\n').map(l => {
      const [id, title, ...descParts] = l.split('|');
      return { id, title, desc: descParts.join('|').slice(0, 400) };
    }).filter(v => v.id && v.title);
  } catch { return []; }
}

// ── 1. Fetch TCGCSV groups ─────────────────────────────────────────────────
console.error(`[scout] Querying TCGCSV groups for: "${query}"`);
const groupsRaw = curl(`${TCGCSV_BASE}/groups`);
const groupsData = JSON.parse(groupsRaw || '{}');
const groups = Array.isArray(groupsData) ? groupsData : (groupsData.results || []);

// Score + rank
const scored = groups
  .map(g => ({ ...g, score: fuzzyScore(g.name || '', query) }))
  .filter(g => g.score > 0)
  .sort((a, b) => b.score - a.score);

if (!scored.length) {
  console.error('[scout] No TCGCSV match. Check query — available groups:');
  groups.slice(0, 20).forEach(g => console.error(`  ${g.groupId} ${g.name} (${g.publishedOn?.slice(0,10)})`));
  process.exit(1);
}

const best = scored[0];
console.error(`[scout] Matched: "${best.name}" (groupId ${best.groupId}, release ${best.publishedOn?.slice(0,10)}, score ${(best.score*100).toFixed(0)}%)`);
if (scored.length > 1) console.error(`[scout] Runners-up: ${scored.slice(1,3).map(g=>`"${g.name}" (${g.score.toFixed(2)})`).join(', ')}`);

// ── 2. Get ProductsAndPrices.csv ───────────────────────────────────────────
console.error(`[scout] Fetching products CSV for groupId ${best.groupId}…`);
const csvText = curl(`${TCGCSV_BASE}/${best.groupId}/ProductsAndPrices.csv`);
const rows = csvText ? parseCsv(csvText) : [];

const SEALED_RE = /(booster\s*box|booster\s*pack|elite\s*trainer|\betb\b|\bbox\b|\bpack\b|collection|bundle|display|\bcase\b|\bdeck\b|starter|tin|blister|premium|build\s*&\s*battle|sleeved)/i;
// lowPrice field sometimes contains UPC barcodes (>1M = barcode, not price) — strip them
function safePrice(v) { const n = parseFloat(v || ''); return (n > 0 && n < 50000) ? n : null; }

const allSealed = rows.slice(1).filter(r => SEALED_RE.test(r[1] || ''));
const cards = rows.slice(1)
  .filter(r => r[13] && parseFloat(r[13]) > 0 && !SEALED_RE.test(r[1] || ''))
  .map(r => ({ id: r[0], name: r[1], market: parseFloat(r[13] || 0), rarity: r[17] || '' }))
  .filter(c => c.market > 0)
  .sort((a, b) => b.market - a.market);

console.error(`[scout] ${allSealed.length} sealed products, ${cards.length} cards with prices`);

// ── 3. Find ETB + siblings in same series ──────────────────────────────────
// Detect series prefix from set name (ME01, ME02, etc.)
const seriesPrefix = (best.name.match(/^([A-Z]+)[\d:]/) || [])[1];
let siblingETBs = [];
if (seriesPrefix) {
  const siblings = groups
    .filter(g => g.name.startsWith(seriesPrefix) && g.groupId !== best.groupId && new Date(g.publishedOn) < new Date())
    .sort((a, b) => b.groupId - a.groupId);  // most recent first
  for (const sib of siblings.slice(0, 4)) {  // 4 most recent released siblings
    const sibCsv = curl(`${TCGCSV_BASE}/${sib.groupId}/ProductsAndPrices.csv`);
    if (!sibCsv) continue;
    const sibRows = parseCsv(sibCsv);
    const etb = sibRows.slice(1).find(r => /elite\s*trainer/i.test(r[1] || '') && !/case|exclusive|center/i.test(r[1] || ''));
    const pcEtb = sibRows.slice(1).find(r => /elite\s*trainer/i.test(r[1] || '') && /center|exclusive/i.test(r[1] || '') && !/case/i.test(r[1] || ''));
    const etbMarket = safePrice(etb?.[13]);
    const pcEtbMarket = safePrice(pcEtb?.[13]);
    // Filter out clearly wrong presale prices (ME01 had $3000 ETB = bad data)
    const etbValid = etbMarket && etbMarket > 40 && etbMarket < 500;
    const pcValid = pcEtbMarket && pcEtbMarket > 40 && pcEtbMarket < 1000;
    if (etbValid || pcValid) {
      siblingETBs.push({
        set: sib.name, date: sib.publishedOn?.slice(0, 10),
        etbId: etb?.[0], etbName: etb?.[1], etbMarket: etbValid ? etbMarket : null,
        pcEtbId: pcEtb?.[0], pcEtbName: pcEtb?.[1], pcEtbMarket: pcValid ? pcEtbMarket : null,
      });
    }
  }
  console.error(`[scout] ${siblingETBs.length} sibling sets with ETB data`);
}

// Estimate retail from siblings
const sibRetails = siblingETBs.map(s => s.etbMarket).filter(p => p && p > 40 && p < 150);
const estimatedRetail = sibRetails.length
  ? Math.round(sibRetails.reduce((a, b) => a + b, 0) / sibRetails.length / 5) * 5  // round to nearest $5
  : 59.99;

// ── 4. Bulbapedia lookup ───────────────────────────────────────────────────
console.error('[scout] Checking Bulbapedia…');
const bpSlug = best.name.replace(/^ME\d*:\s*/i, '').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
const bpRaw = curl(`https://bulbapedia.bulbagarden.net/wiki/${bpSlug}_(TCG)`);
let bpBlurb = '';
if (bpRaw && bpRaw.length > 500) {
  const clean = bpRaw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const blurbMatch = clean.match(/Blurb\s+(.*?)(?:Information|Card list|Contents)/);
  const infoMatch = clean.match(/Information\s+(.*?)(?:Card list|Contents|Gallery)/);
  bpBlurb = (blurbMatch?.[1] || infoMatch?.[1] || '').trim().slice(0, 500);
}
console.error(`[scout] Bulbapedia: ${bpBlurb ? bpBlurb.slice(0,80)+'…' : 'not found'}`);

// ── 5. YouTube community intel ─────────────────────────────────────────────
const setShortName = best.name.replace(/^ME\d*:\s*/i, '').replace(/Pokémon\s*/i, '');
console.error(`[scout] YouTube search for: "${setShortName} elite trainer box"…`);
const videos = ytdlpSearch(`pokemon ${setShortName} elite trainer box 2026`, 8);
console.error(`[scout] ${videos.length} videos found`);

// ── 6. Build product key + stub ────────────────────────────────────────────
const setNameClean = best.name.replace(/^ME\d*:\s*/i, '').replace(/Pokémon\s*/i, '').trim();
const productKey = slugify(setNameClean) + '-etb';
const releaseDate = best.publishedOn?.slice(0, 10) || 'TBD';
const isPreRelease = new Date(releaseDate) > new Date();

// Find current set ETB in CSV (may not exist yet)
const currentEtb = allSealed.find(r => /elite\s*trainer/i.test(r[1] || '') && !/case|exclusive|center/i.test(r[1] || ''));
const currentPcEtb = allSealed.find(r => /elite\s*trainer/i.test(r[1] || '') && /center|exclusive/i.test(r[1] || ''));

// Chase cards for set analysis
const chaseCards = cards.slice(0, 5).map(c => `$${c.market} ${c.name}${c.rarity ? ' ['+c.rarity+']' : ''}`).join(', ') || 'RESEARCH REQUIRED';

// Sibling ETB comp string
const sibCompStr = siblingETBs.map(s =>
  `${s.set}: ETB $${s.etbMarket || 'N/A'}${s.pcEtbMarket ? ' / PC ETB $'+s.pcEtbMarket : ''}`
).join(' | ') || 'No sibling data';

// YouTube evidence
const ytEvidence = videos.slice(0, 3).map(v =>
  `YouTube: "${v.title}" — ${v.desc.slice(0, 200)}`
).join('\n   ');

// ── 7. Output stub ────────────────────────────────────────────────────────
const stub = `
  '${productKey}': {
    label:      'Pokémon TCG: ${setNameClean} Elite Trainer Box',
    category:   'pokemon',
    set:        '${setNameClean}',
    retail:     ${estimatedRetail},          // estimated from ${seriesPrefix || 'series'} siblings — verify before posting
    retailNote: 'Target / Walmart (estimated)',
    releaseDate: '${releaseDate}',
    releaseUrl: 'https://www.tcgplayer.com/search/pokemon/${slugify(setNameClean)}',
    preRelease:  ${isPreRelease},
    forceRating: 'DBLGREEN',                 // ← SET THIS after review
    forceRisk:   '🟢 Low',                   // ← SET THIS after review
    tcgId:       ${currentEtb ? currentEtb[0] : 'null'},
    ebayQuery:   'Pokemon ${setNameClean} Elite Trainer Box',
    contents:    '9 booster packs + accessories | ${bpBlurb.slice(0, 150) || 'RESEARCH REQUIRED'}',
    pcExclusive: { label: 'PC Exclusive ETB', tcgId: ${currentPcEtb ? currentPcEtb[0] : 'null'}, note: '${currentPcEtb ? 'TCGPlayer ID confirmed — market $'+currentPcEtb[13] : 'Expected based on series pattern'}' },
    sellThrough: {
      flip:   { range: 'TBD', units: 'TBD' },
      hold:   { range: 'TBD', units: 'TBD' },
      invest: { range: 'TBD', units: 'TBD' },
    },
    bulkBuy:   '250+ units',
    risk:      '🟢 Low',
    ebayFee:   0.13,
    evidence: [
      { source: 'TCGCSV (verified)', date: '${new Date().toISOString().slice(0,10)}', point: 'Set groupId ${best.groupId}, releases ${releaseDate}. ${allSealed.length} sealed products listed. ${currentEtb ? 'ETB listed: '+currentEtb[1]+' low $'+(safePrice(currentEtb[10])||'N/A')+' / market $'+(safePrice(currentEtb[13])||'N/A') : 'ETB not yet listed on TCGPlayer.'}' },
${cards.length ? `      { source: 'TCGCSV chase cards', date: '${new Date().toISOString().slice(0,10)}', point: 'Top 5 by market: ${cards.slice(0,5).map(c=>'$'+c.market+' '+c.name).join(', ')}' },` : '      // No card prices yet'}
      // ADD: YouTube/Discord/community intel here
    ],
    scenarios: [
      { label: 'Bear', prob: 15, text: 'RESEARCH REQUIRED — fill after reading community intel' },
      { label: 'Base', prob: 55, text: 'RESEARCH REQUIRED — use sibling comps: ${sibCompStr}' },
      { label: 'Bull', prob: 30, text: 'RESEARCH REQUIRED' },
    ],
    writeup: {
      market:      '• RESEARCH REQUIRED\\n• Sibling ETB comps: ${sibCompStr}',
      product:     '• RESEARCH REQUIRED\\n• ${bpBlurb.slice(0, 300).replace(/'/g, "\\'")}',
      priceComp:   '• ${sibCompStr}\\n• RESEARCH REQUIRED',
      supplyDemand:'• RESEARCH REQUIRED',
      recs:        '• RESEARCH REQUIRED',
    },
  },
`;

// ── 8. Print full report ──────────────────────────────────────────────────
console.log('\n' + '='.repeat(80));
console.log(`PRERELEASE SCOUT: ${best.name}`);
console.log('='.repeat(80));
console.log(`Release:     ${releaseDate} | groupId: ${best.groupId} | isPreRelease: ${isPreRelease}`);
console.log(`Cards in CSV: ${rows.length - 1} total | ${cards.length} with prices | ${allSealed.length} sealed products`);
console.log('');

if (allSealed.length) {
  console.log('── SEALED PRODUCTS ──');
  allSealed.forEach(r => console.log(`  ID:${r[0]} | ${r[1]} | low:$${safePrice(r[10])||'?'} | market:$${safePrice(r[13])||'?'}`));
  console.log('');
}

if (cards.length) {
  console.log('── TOP 5 CHASE CARDS ──');
  cards.slice(0, 5).forEach(c => console.log(`  $${c.market} | ${c.name} | ${c.rarity}`));
  console.log('');
}

if (siblingETBs.length) {
  console.log('── SIBLING ETB COMPS ──');
  siblingETBs.forEach(s => console.log(`  ${s.set} (${s.date}): ETB $${s.etbMarket||'?'} | PC ETB $${s.pcEtbMarket||'?'}`));
  console.log('');
}

if (bpBlurb) {
  console.log('── BULBAPEDIA ──');
  console.log(' ', bpBlurb);
  console.log('');
}

if (videos.length) {
  console.log('── YOUTUBE INTEL ──');
  videos.slice(0, 5).forEach(v => console.log(`  [${v.id}] ${v.title}\n    ${v.desc.slice(0, 200)}`));
  console.log('');
}

console.log('── PRODUCT STUB (paste into fiddler-research.mjs PRODUCTS map) ──');
console.log(stub);
console.log('='.repeat(80));
console.log(`CLI: node fiddler-research.mjs ${productKey}`);
console.log(`     DASHBOARD_MODE=1 EVIDENCE_OK=1 node fiddler-research.mjs ${productKey}`);
console.log('='.repeat(80));
