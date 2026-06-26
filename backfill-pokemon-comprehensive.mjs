#!/usr/bin/env node
// Comprehensive Pokemon backfill: fill booster-box, ETB, bundle, pack + premium types across all 305 sets
// Usage: node backfill-pokemon-comprehensive.mjs [proxy-list-file] [set-filter-regex] [limit]

import { readFileSync, writeFileSync } from 'fs';
import { pcSealed, pcConsoleList } from './lib/pricecharting.mjs';
import { chromium } from 'playwright';

// Per handbook: all Pokemon product ranges
const ALL_TYPES = [
  // Standard (most modern sets)
  'booster-box', 'elite-trainer-box', 'booster-bundle', 'booster-pack',
  // Tins
  'display-tin-set-10-count', 'display-tin-set-8-count', 'tin-set-10-count', 'tin-set-8-count',
  // Collections
  'collection-box', 'collection-boxes', 'premium-collection',
  // Blisters
  '3-pack-blister', '2-pack-blister', 'booster-blister', 'blister-pack',
  // Premium variants
  'ultra-premium-collection', 'super-premium-collection', 'deluxe-collection'
];

// Parse proxy file
function readProxies(file) {
  if (!file || !file.match(/\.txt$/)) return [];
  try {
    return readFileSync(file, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && /^\d+\.\d+/.test(l))
      .map(l => {
        const [ip, port, user, pass] = l.split(':');
        return { server: `http://${ip}:${port}`, username: user, password: pass };
      });
  } catch { return []; }
}

// Load DB
function loadDB(file) {
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return { _meta: { source: 'pricecharting', updated: new Date().toISOString().split('T')[0] }, sets: {} }; }
}

// Save DB
function saveDB(file, db) {
  writeFileSync(file, JSON.stringify(db, null, 1));
}

// Proxy rotation
let proxyIdx = 0;
const proxyList = readProxies(process.argv[2]);
function nextProxy() {
  if (!proxyList.length) return null;
  const p = proxyList[proxyIdx % proxyList.length];
  proxyIdx++;
  return p;
}

// Retry with browser + proxy
async function scrapeWithProxy(setSlug, type, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const proxy = nextProxy();
      const browser = await chromium.launch({ headless: true, proxy });
      try {
        const result = await pcSealed(setSlug, type, browser);
        await browser.close();
        return result;
      } catch (e) {
        await browser.close();
        throw e;
      }
    } catch (e) {
      if (i < retries - 1) await new Promise(r => setTimeout(r, (i + 1) * 3000));
      else throw e;
    }
  }
}

// Main backfill
async function backfill() {
  const dbFile = 'set-history.json';
  const filterArg = process.argv[3];
  const limitArg = parseInt(process.argv[4]) || 0;
  const filter = filterArg ? new RegExp(filterArg) : null;

  const db = loadDB(dbFile);
  const setKeys = Object.keys(db.sets);

  console.log(`📥 Pokemon Comprehensive Backfill`);
  console.log(`  Total sets: ${setKeys.length}`);
  console.log(`  Proxies: ${proxyList.length}`);
  if (filter) console.log(`  Filter: ${filter.source}`);
  console.log(`  Target types (handbook): ${ALL_TYPES.length} variants`);
  console.log();

  let processed = 0, added = 0, skipped = 0;

  for (const setKey of setKeys) {
    if (filter && !filter.test(setKey)) continue;
    if (limitArg > 0 && processed >= limitArg) break;
    processed++;

    const setRec = db.sets[setKey];
    if (!setRec.products) setRec.products = {};

    let setAdded = 0;

    // All types from handbook
    for (const type of ALL_TYPES) {
      if (setRec.products[type]) continue; // Already have

      try {
        const result = await scrapeWithProxy(setKey, type, 2);
        if (result) {
          setRec.products[type] = result;
          setAdded++;
          const marker = type.includes('premium') || type.includes('ultra') || type.includes('deluxe') ? '💎' : '✓';
          console.log(`  ${marker} ${setKey}/${type}: ${result.current}USD (ATH ${result.ath}USD)`);
        } else {
          // Silent on no-data; many types won't exist for all sets
        }
      } catch (e) {
        // Silent: skip if 404/timeout
      }

      await new Promise(r => setTimeout(r, 600)); // Rate limit
    }

    added += setAdded;

    // Save every 10 sets
    if (processed % 10 === 0) {
      db._meta.updated = new Date().toISOString().split('T')[0];
      saveDB(dbFile, db);
      console.log(`  [saved @ ${processed} sets]\n`);
    }
  }

  db._meta.updated = new Date().toISOString().split('T')[0];
  saveDB(dbFile, db);

  console.log(`\n✓ Backfill complete:`);
  console.log(`  Processed: ${processed} sets`);
  console.log(`  Added: ${added} product records`);
  console.log(`  Skipped: ${skipped} (no data found)`);
}

backfill().catch(e => { console.error('Fatal:', e); process.exit(1); });
