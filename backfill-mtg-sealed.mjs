#!/usr/bin/env node
/**
 * backfill-mtg-sealed.mjs — Full MTG set data backfill into set-history-mtg.json
 *
 * Usage:
 *   node backfill-mtg-sealed.mjs "final fantasy"
 *   node backfill-mtg-sealed.mjs "foundations"
 *   node backfill-mtg-sealed.mjs --all          ← backfill every set in the DB
 *
 * Per set, runs IN PARALLEL:
 *   1. TCGPlayer ID scan (parallel batches, step-1) → all product IDs + live market
 *   2. PriceCharting full price history for every sealed format
 *   3. StockX MSRP + current market
 *   4. DDG/Bing MSRP search (WPN article) if StockX MSRP < $100 (per-pack flag)
 *
 * Writes into set-history-mtg.json:
 *   products[format] = { current, ath, first, priceHistory[], tcgId, market, ... }
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { chromium } from 'playwright';
import { pcAllSealedTypes, pcConsoleListBy } from './lib/pricecharting.mjs';
import { stockxMarket } from './lib/stockx.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(ROOT, 'set-history-mtg.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// PriceCharting sealed formats to try for MTG
const MTG_SEALED_TYPES = [
  'booster-box',
  'collector-booster-box',
  'set-booster-box',
  'bundle',
  'commander-deck',
  'prerelease-pack-case',
  'jumpstart-booster-box',
  'play-booster-box',
  'draft-booster-box',
];

// TCGPlayer scan — two-pass: coarse step-50 to find anchors, then step-1 ±1000 around hits
const TCG_COARSE_RANGE = [560000, 680000]; // covers 2021-2026 MTG sets
const TCG_COARSE_STEP  = 50;
const TCG_FINE_WINDOW  = 1500;  // ±1500 around each coarse hit
const TCG_CONCURRENCY  = 100;   // parallel fetches per batch
const TCG_TIMEOUT_MS   = 2000;  // per-request abort timeout

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadDb() {
  if (!existsSync(DB_PATH)) return { _meta: { db: 'mtg', source: 'multi-source backfill' }, sets: {} };
  return JSON.parse(readFileSync(DB_PATH, 'utf8'));
}

function saveDb(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function curlGet(url) {
  try {
    return execSync(`curl -s -A "${UA}" -L --max-time 12 --connect-timeout 7 "${url}"`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 18000 });
  } catch { return ''; }
}

// ── TCGPlayer parallel scan ───────────────────────────────────────────────────

async function tcgFetchOne(id) {
  try {
    const r = await fetch(`https://mp-search-api.tcgplayer.com/v2/product/${id}/details`, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://www.tcgplayer.com/' },
      signal: AbortSignal.timeout(TCG_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return { id, name: d.productName ?? null, price: d.lowestPrice ?? null, market: d.marketPrice ?? null };
  } catch { return null; }
}

async function tcgBatchScan(ids, nameFilter, label) {
  const results = [];
  for (let i = 0; i < ids.length; i += TCG_CONCURRENCY) {
    const batch = ids.slice(i, i + TCG_CONCURRENCY);
    const hits = await Promise.all(batch.map(tcgFetchOne));
    for (const h of hits) {
      if (!h?.name) continue;
      if (nameFilter && !h.name.toLowerCase().includes(nameFilter.toLowerCase())) continue;
      results.push(h);
    }
    if (i > 0 && i % 2000 === 0) {
      console.log(`    [tcg:${label}] ${i}/${ids.length} scanned, ${results.length} hits so far`);
      await new Promise(r => setTimeout(r, 800)); // brief pause every 2k
    }
  }
  return results;
}

async function tcgScanForSet(nameFilter) {
  // Pass 1: coarse scan (step-50) across full range — finds anchor IDs quickly
  const [coarseStart, coarseEnd] = TCG_COARSE_RANGE;
  const coarseIds = [];
  for (let id = coarseStart; id <= coarseEnd; id += TCG_COARSE_STEP) coarseIds.push(id);
  console.log(`  [tcg] pass-1 coarse: ${coarseIds.length} IDs (step-${TCG_COARSE_STEP}, range ${coarseStart}-${coarseEnd})`);
  const coarseHits = await tcgBatchScan(coarseIds, nameFilter, 'coarse');
  console.log(`  [tcg] pass-1 done: ${coarseHits.length} anchors found`);

  if (!coarseHits.length) {
    console.log(`  [tcg] no anchors — trying permutations (broader name match)...`);
    // Try partial name words for fuzzy match — max 2 words, 60s total
    const words = nameFilter.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 2);
    const fuzzyDeadline = Date.now() + 60000;
    for (const word of words) {
      if (Date.now() > fuzzyDeadline) { console.log(`  [tcg] fuzzy timeout — skipping`); break; }
      const hits = await tcgBatchScan(coarseIds, word, `coarse:${word}`);
      if (hits.length) {
        console.log(`  [tcg] fuzzy match on "${word}": ${hits.length} anchors`);
        coarseHits.push(...hits.filter(h => !coarseHits.find(e => e.id === h.id)));
        break;
      }
    }
  }

  if (!coarseHits.length) return [];

  // Pass 2: fine scan (step-1) ±TCG_FINE_WINDOW around each cluster of anchor IDs
  const anchorIds = coarseHits.map(h => h.id);
  const minAnchor = Math.min(...anchorIds);
  const maxAnchor = Math.max(...anchorIds);
  const fineStart = Math.max(coarseStart, minAnchor - TCG_FINE_WINDOW);
  const fineEnd   = Math.min(coarseEnd,   maxAnchor + TCG_FINE_WINDOW);
  const fineIds   = Array.from({ length: fineEnd - fineStart + 1 }, (_, i) => fineStart + i);
  console.log(`  [tcg] pass-2 fine: ${fineIds.length} IDs (step-1, range ${fineStart}-${fineEnd})`);
  const fineHits = await tcgBatchScan(fineIds, nameFilter, 'fine');
  console.log(`  [tcg] pass-2 done: ${fineHits.length} products`);
  return fineHits;
}

// Classify TCGPlayer product name into sealed format key.
// WotC uses "Display" where older naming said "Box" — both map to the same key.
function classifyTcgProduct(name) {
  const n = name.toLowerCase();
  // Skip accessories — not sealed product investments
  if (/spindown|life\s+counter|sleeve|playmat|die\b|oversized|pin\b|card\s+sleeve/.test(n)) return null;
  if (/art\s+series|token|checklist/.test(n)) return null;

  // Collector Booster — check before generic "booster" patterns
  if (/collector\s+booster\s+display\s+master\s+case/.test(n)) return 'collector-booster-display-master-case';
  if (/collector\s+booster\s+display\s+case/.test(n))          return 'collector-booster-display-case';
  if (/collector\s+booster\s+(display|box)$/.test(n))          return 'collector-booster-box';
  if (/collector\s+booster\s+(display|box)/.test(n) && !/pack|sample|omega|japanese|jp\b/.test(n)) return 'collector-booster-box';
  if (/collector\s+booster\s+sample/.test(n))                  return 'collector-booster-sample-pack';
  if (/collector\s+booster\s+omega/.test(n))                   return 'collector-booster-omega-pack';
  if (/collector\s+booster\s+pack/.test(n) && /minimal/.test(n)) return 'collector-booster-pack-minimal';
  if (/collector\s+booster\s+pack/.test(n))                    return 'collector-booster-pack';

  // Play Booster
  if (/play\s+booster\s+display\s+case/.test(n))  return 'play-booster-display-case';
  if (/play\s+booster\s+(display|box)/.test(n))    return 'play-booster-box';
  if (/sleeved\s+play\s+booster/.test(n))          return 'sleeved-play-booster-pack';
  if (/play\s+booster\s+pack/.test(n))             return 'play-booster-pack';

  // Draft / Set Booster
  if (/draft\s+booster\s+(box|display)/.test(n))   return 'draft-booster-box';
  if (/set\s+booster\s+(box|display)/.test(n))     return 'set-booster-box';
  if (/jumpstart/.test(n))                          return 'jumpstart-booster-box';

  // Scene box
  if (/scene\s+box\s+case/.test(n)) return 'scene-box-case';
  if (/scene\s+box/.test(n))        return 'scene-box';

  // Chocobo / special bundles (FF-specific but pattern works generically)
  if (/chocobo\s+bundle\s+case/.test(n))    return 'chocobo-bundle-case';
  if (/chocobo\s+bundle/.test(n))           return 'chocobo-bundle';
  if (/chocobo\s+booster/.test(n))          return 'chocobo-booster-pack';

  // Gift / Starter / Play Pack
  if (/gift\s+bundle\s+case/.test(n))       return 'gift-bundle-case';
  if (/gift\s+bundle/.test(n))              return 'gift-bundle';
  if (/bundle\s+case/.test(n))              return 'bundle-case';
  if (/bundle/.test(n))                     return 'bundle';
  if (/starter\s+kit\s+case/.test(n))       return 'starter-kit-case';
  if (/starter\s+kit/.test(n))              return 'starter-kit';
  if (/play\s+pack/.test(n))                return 'play-pack';

  // Prerelease
  if (/prerelease\s+pack\s+case/.test(n))   return 'prerelease-pack-case';
  if (/prerelease\s+pack/.test(n))          return 'prerelease-pack';

  // Commander
  if (/commander\s+(deck|kit)\s+case/.test(n)) return 'commander-deck-case';
  if (/commander\s+(deck|kit)/.test(n))         return 'commander-deck';
  if (/deluxe\s+commander/.test(n))             return 'commander-deck-deluxe';

  // Promo / Secret Lair
  if (/promo\s+bundle\s+case/.test(n))  return 'promo-bundle-case';
  if (/promo\s+bundle/.test(n))         return 'promo-bundle';
  if (/secret\s+lair/.test(n))          return 'secret-lair';

  // Japanese variants
  if (/basic\s+booster\s+display\s+japanese|japanese.*basic\s+booster/.test(n)) return 'basic-booster-display-japanese';
  if (/collector\s+booster.*japanese|japanese.*collector\s+booster/.test(n))     return 'collector-booster-box-japanese';
  if (/collector\s+booster.*japanese.*pack/.test(n))                             return 'collector-booster-pack-japanese';

  // Fallback — skip singles / individual cards
  if (/\[fin\]|\[mtg\]|\bfoil\b.*\bsingle\b|\bextended art\b$/.test(n)) return null;

  return null; // skip unknowns rather than polluting DB with junk
}

// ── MSRP sourcing ─────────────────────────────────────────────────────────────

async function fetchMsrpDdg(setName) {
  // Query DDG for WPN/ICV2 article with per-pack × count MSRP
  const q = encodeURIComponent(`"${setName}" "collector booster" "MSRP" "$" wizards.com OR icv2.com OR mtgrocks.com`);
  const raw = curlGet(`https://duckduckgo.com/html/?q=${q}`);
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');

  // Look for per-pack price mention: "$XX.XX per pack" or "MSRP of $XX" etc.
  const patterns = [
    // Box-level prices first (>$50)
    /collector booster box[^.,$]{0,40}\$(\d{3,4}\.?\d{0,2})/i,
    /\$(\d{3,4}\.?\d{0,2})[^.,$]{0,40}collector booster box/i,
    // Per-pack prices (will multiply ×12)
    /collector booster[^.,$]{0,30}\$(\d{1,2}\.\d{2})\s*per\s*pack/i,
    /\$(\d{1,2}\.\d{2})\s*per\s*pack[^.]*?collector/i,
    /Collector Booster[^.]*?\$(\d{1,3}\.\d{2})/i,
    /\$(\d{1,3}\.\d{2})[^.]*?per pack/i,
    /MSRP[^$]{0,20}\$(\d{2,3}\.\d{2})/i,
    /\$(\d{2,3}\.\d{2})[^.]*?MSRP/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const price = parseFloat(m[1]);
      if (price > 10 && price < 2000) return { msrp: price, source: 'DDG/WPN article' };
    }
  }

  // Also check for box price directly
  const boxMatch = text.match(/collector booster box[^.]*?\$(\d{2,3}\.\d{2})/i)
                ?? text.match(/\$(\d{2,3}\.\d{2})[^.]*?collector booster box/i);
  if (boxMatch) {
    const price = parseFloat(boxMatch[1]);
    if (price > 50 && price < 2000) return { msrp: price, source: 'DDG box price' };
  }

  return null;
}

// ── PriceCharting slug construction for MTG ───────────────────────────────────

function buildPcSlugs(setName) {
  const slug = slugify(setName);
  // PriceCharting MTG slugs use "magic-{setname}" format (enumerated via pcConsoleListBy)
  return [
    `magic-${slug}`,
    `magic-the-gathering-${slug}`,
    `magic-the-gathering-universes-beyond-${slug}`,
    `magic-universes-beyond-${slug}`,
  ];
}

// Load PriceCharting slug map once and cache
let _pcSlugMap = null;
async function getPcSlugMap() {
  if (_pcSlugMap) return _pcSlugMap;
  try {
    const slugs = await pcConsoleListBy('magic-cards', /^magic-/, /^magic-/);
    _pcSlugMap = {};
    for (const s of slugs) {
      // key = slug without "magic-" prefix, normalized
      const key = s.slug.replace(/^magic-/, '').replace(/-/g, ' ');
      _pcSlugMap[key] = s.slug;
    }
    console.log(`  [pc-map] loaded ${slugs.length} MTG slugs from PriceCharting`);
  } catch { _pcSlugMap = {}; }
  return _pcSlugMap;
}

// Find best PriceCharting slug for a set name
async function findPcSlug(setName) {
  const map = await getPcSlugMap();
  const norm = setName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  // Exact match
  if (map[norm]) return map[norm];
  // Prefix match (e.g. "final fantasy" matches "final fantasy commander" etc)
  const match = Object.entries(map).find(([k]) => k === norm || k.startsWith(norm + ' '));
  if (match) return match[1];
  // Fallback: build slug patterns
  return null;
}

async function fetchPcHistory(setName, browser) {
  // Try the enumerated PC slug first (most reliable)
  const pcSlug = await findPcSlug(setName);
  const slugsToTry = pcSlug
    ? [pcSlug, ...buildPcSlugs(setName).filter(s => s !== pcSlug)]
    : buildPcSlugs(setName);

  for (const slug of slugsToTry) {
    const results = await pcAllSealedTypes(slug, MTG_SEALED_TYPES, browser);
    if (results.length > 0) {
      console.log(`  [pc] matched slug: ${slug} → ${results.length} formats`);
      return { slug, results };
    }
  }
  console.log(`  [pc] no PriceCharting data for: ${setName} (tried: ${slugsToTry[0]})`);
  return null;
}

// ── Main per-set logic ────────────────────────────────────────────────────────

async function processSet(setName, db, browser) {
  const key = slugify(setName);
  console.log(`\n[backfill-mtg] Processing: "${setName}" (key: ${key})`);

  // Init DB record
  if (!db.sets[key]) db.sets[key] = { name: setName, products: {} };
  const rec = db.sets[key];
  rec.updatedAt = today();

  // 1. TCGPlayer two-pass parallel scan
  const tcgProducts = await tcgScanForSet(setName);
  console.log(`  [tcg] ${tcgProducts.length} matching products found`);

  // Merge TCGPlayer products into DB
  for (const p of tcgProducts) {
    const format = classifyTcgProduct(p.name);
    if (!format || format === null) continue;
    if (!rec.products[format]) rec.products[format] = {};
    const entry = rec.products[format];
    entry.tcgId = entry.tcgId ?? p.id;
    entry.tcgName = p.name;
    if (p.market != null) {
      entry.tcgMarket = p.market;
      // Add to priceHistory
      if (!entry.priceHistory) entry.priceHistory = [];
      const dateStr = today();
      const existing = entry.priceHistory.find(h => h.date === dateStr && h.source === 'tcgplayer');
      if (!existing) entry.priceHistory.push({ date: dateStr, price: p.market, source: 'tcgplayer' });
      // Update current if not already set or stale
      if (!entry.current || Math.abs(entry.current - p.market) / entry.current > 0.1) {
        entry.current = p.market;
        entry.currentDate = dateStr;
      }
    }
    console.log(`    [tcg] ${format}: id=${p.id} market=$${p.market ?? 'N/A'} — ${p.name}`);
  }

  // 2. PriceCharting full history — 90s timeout guard (PC Playwright can hang indefinitely)
  console.log(`  [pc] fetching PriceCharting history...`);
  const pcData = await Promise.race([
    fetchPcHistory(setName, browser),
    new Promise(res => setTimeout(() => { console.log(`  [pc] TIMEOUT — skipping`); res(null); }, 90000)),
  ]);
  if (pcData) {
    for (const result of pcData.results) {
      const format = result.type;
      if (!rec.products[format]) rec.products[format] = {};
      const entry = rec.products[format];

      // Merge full price series into priceHistory
      if (!entry.priceHistory) entry.priceHistory = [];
      for (const pt of (result.series ?? [])) {
        // series points are monthly { m: 'YYYY-MM', price }
        const dateStr = pt.m + '-01'; // normalize to YYYY-MM-DD
        const exists = entry.priceHistory.find(h => h.date.startsWith(pt.m) && h.source === 'pricecharting');
        if (!exists) entry.priceHistory.push({ date: dateStr, price: pt.price, source: 'pricecharting' });
      }
      // Sort by date
      entry.priceHistory.sort((a, b) => a.date.localeCompare(b.date));

      // Update summary fields
      entry.current   = entry.current ?? result.current;
      entry.ath       = Math.max(entry.ath ?? 0, result.ath);
      entry.athMonth  = entry.ath === result.ath ? result.athMonth : entry.athMonth;
      entry.first     = entry.first ?? result.first;
      entry.firstMonth= entry.firstMonth ?? result.firstMonth;
      entry.pcSlug    = pcData.slug;
      entry.pcPoints  = result.points;
      entry.updatedAt = today();

      console.log(`    [pc] ${format}: current=$${result.current} ath=$${result.ath} (${result.points} pts)`);
    }
  }

  // 3. StockX market + MSRP (try collector booster box specifically)
  console.log(`  [stx] fetching StockX...`);
  let msrpVerified = false;
  try {
    const stx = await stockxMarket(`magic the gathering ${setName} collector booster box`);
    if (stx?.price) {
      if (!rec.products['collector-booster-box']) rec.products['collector-booster-box'] = {};
      const cbb = rec.products['collector-booster-box'];
      cbb.stxMarket  = stx.price;
      cbb.stxAsk     = stx.lowestAsk;
      cbb.stxBid     = stx.highestBid;
      cbb.stxUrlKey  = stx.urlKey;
      // Only use StockX MSRP if it looks like a box price (>$100)
      if (stx.msrp && stx.msrp > 100) {
        rec.retail         = stx.msrp;
        rec.retailSource   = `StockX MSRP (${stx.urlKey})`;
        rec.retailVerified = true;
        msrpVerified       = true;
        console.log(`    [stx] MSRP: $${stx.msrp} (box-level, verified)`);
      } else if (stx.msrp) {
        console.log(`    [stx] MSRP: $${stx.msrp} (per-pack — skipped, too low)`);
      }
      // Add to priceHistory
      if (!cbb.priceHistory) cbb.priceHistory = [];
      const dateStr = today();
      const exists = cbb.priceHistory.find(h => h.date === dateStr && h.source === 'stockx');
      if (!exists && stx.price) cbb.priceHistory.push({ date: dateStr, price: stx.price, source: 'stockx' });
      cbb.current = cbb.current ?? stx.price;
      console.log(`    [stx] market: $${stx.price} (ask $${stx.lowestAsk} / bid $${stx.highestBid})`);
    }
  } catch (e) { console.log(`    [stx] error: ${e.message}`); }

  // 4. DDG MSRP search if StockX MSRP was per-pack or missing
  if (!msrpVerified) {
    console.log(`  [ddg] searching WPN for MSRP...`);
    const ddgMsrp = await fetchMsrpDdg(setName);
    if (ddgMsrp) {
      // Distinguish per-pack vs box price
      if (ddgMsrp.msrp < 100) {
        // Per-pack — try to infer box (12 packs standard)
        const boxMsrp = +(ddgMsrp.msrp * 12).toFixed(2);
        rec.retail         = boxMsrp;
        rec.retailSource   = `${ddgMsrp.source} ($${ddgMsrp.msrp}/pack × 12)`;
        rec.retailVerified = true;
        console.log(`    [ddg] per-pack $${ddgMsrp.msrp} → box $${boxMsrp}`);
      } else {
        rec.retail         = ddgMsrp.msrp;
        rec.retailSource   = ddgMsrp.source;
        rec.retailVerified = true;
        console.log(`    [ddg] box MSRP $${ddgMsrp.msrp}`);
      }
    } else {
      console.log(`    [ddg] MSRP not found`);
    }
  }

  // Propagate retail to all product entries
  if (rec.retail) {
    for (const entry of Object.values(rec.products)) {
      if (!entry.retail) {
        entry.retail = rec.retail;
        entry.retailSource = rec.retailSource;
      }
    }
  }

  return rec;
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node backfill-mtg-sealed.mjs "set name" | --all');
    process.exit(1);
  }

  const db = loadDb();
  const browser = await chromium.launch({ headless: true });

  try {
    let sets = [];
    if (args[0] === '--all') {
      // Enumerate all MTG slugs from PriceCharting and process each
      console.log('[backfill-mtg] enumerating MTG sets from PriceCharting...');
      const found = await pcConsoleListBy('magic-cards', /^magic-/, /^magic-/);
      sets = found.map(s => s.name);
      console.log(`[backfill-mtg] ${sets.length} sets found`);
    } else {
      sets = [args.join(' ')];
    }

    for (const setName of sets) {
      try {
        await processSet(setName, db, browser);
        saveDb(db); // save after each set (resume-safe)
      } catch (e) {
        console.error(`[backfill-mtg] ERROR on "${setName}": ${e.message}`);
      }
    }

  } finally {
    await browser.close();
  }

  console.log('\n[backfill-mtg] DONE — set-history-mtg.json updated');
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
