#!/usr/bin/env node
// Backfill Pokemon Ultimate/Super Premium Collections + other expensive premium sets.
// Run: node backfill-pokemon-premium.mjs [set-slug-filter] [proxy-list-file]

import { readFileSync, writeFileSync } from 'fs';
import { pcConsoleList, pcSealed } from './lib/pricecharting.mjs';
import { chromium } from 'playwright';

const PREMIUM_TYPES = [
  'premium-collection',
  'ultimate-premium-collection', // Core Premium Line
  'super-premium-collection',
  'ultra-premium-collection',
  'celebration-premium-collection',
  'deluxe-collection',
  'collection-box', // Alternate names sometimes used
  'special-collection',
];

// Parse proxy file; format: IP:PORT:USER:PASS per line
function readProxies(file) {
  if (!file) return [];
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

// Rotate through proxies; returns next proxy or null if list empty
let proxyIdx = 0;
const proxyList = readProxies(process.argv[3]);
function nextProxy() {
  if (!proxyList.length) return null;
  const p = proxyList[proxyIdx % proxyList.length];
  proxyIdx++;
  return p;
}

// Load current set-history.json
function loadDB(file) {
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return { _meta: { source: 'pricecharting.com', updated: new Date().toISOString().split('T')[0] }, sets: {} }; }
}

// Save with indentation
function saveDB(file, db) {
  writeFileSync(file, JSON.stringify(db, null, 1));
}

// Retry wrapper for Playwright browser with proxy rotation
async function withProxy(fn) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const proxy = nextProxy();
      const browser = await chromium.launch({ headless: true, proxy });
      try {
        return await fn(browser);
      } finally {
        await browser.close();
      }
    } catch (e) {
      console.error(`  [attempt ${attempt}] ${e.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 5000));
    }
  }
  return null;
}

// Main backfill loop
async function backfill() {
  const dbFile = 'set-history.json';
  const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
  const db = loadDB(dbFile);

  console.log('📥 Pokemon Premium Collections Backfill');
  console.log(`  Proxies: ${proxyList.length}`);
  console.log(`  Filter: ${filter ? filter.source : 'all'}`);

  // Enumerate all Pokemon sets
  let allSets = await pcConsoleList();

  if (!allSets.length) {
    console.error('❌ No Pokemon sets enumerated');
    process.exit(1);
  }

  console.log(`✓ ${allSets.length} sets found`);

  let added = 0;
  for (const { slug, name } of allSets) {
    if (filter && !filter.test(slug)) continue;
    if (db.sets[slug]) console.log(`  [${name}] exists, checking premium types...`);
    else { db.sets[slug] = { name, products: {} }; console.log(`  [${name}] new set`); }

    const setRec = db.sets[slug];
    for (const pType of PREMIUM_TYPES) {
      if (setRec.products[pType]) continue; // Already have this type

      const result = await withProxy(async (browser) => pcSealed(slug, pType, browser));
      if (!result) continue;

      console.log(`    ✓ ${pType}: ${result.current}USD (ATH ${result.ath}USD)`);
      setRec.products[pType] = result;
      added++;
      await new Promise(r => setTimeout(r, 1500)); // Rate limit
    }
  }

  db._meta.updated = new Date().toISOString().split('T')[0];
  saveDB(dbFile, db);
  console.log(`\n✓ Backfill complete: ${added} new premium products added`);
}

backfill().catch(e => { console.error('Fatal:', e); process.exit(1); });
