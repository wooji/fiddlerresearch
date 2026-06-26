#!/usr/bin/env node
// Unified backfill: Topps, Mattel, One Piece, Sports with ALL handbook types
// Run: node backfill-all-remaining.mjs [proxy-file]

import { readFileSync, writeFileSync } from 'fs';
import { pcConsoleListBy, SEALED_TYPES_BY } from './lib/pricecharting.mjs';
import { chromium } from 'playwright';

const PROXY_LIST = readFileSync(process.argv[2] || 'C:\\Users\\Christopher\\Desktop\\ISP.txt', 'utf-8')
  .split('\n').filter(l => l && /^\d+\.\d+/.test(l))
  .map(l => { const [ip,port,u,p] = l.split(':'); return {server:`http://${ip}:${port}`,username:u,password:p}; });

let proxyIdx = 0;
const nextProxy = () => PROXY_LIST[proxyIdx++ % PROXY_LIST.length];

async function backfillCategory(catKey, categorySlug, filterRe, dbFile) {
  console.log(`\n📥 ${catKey.toUpperCase()}`);

  const loadDB = () => {
    try { return JSON.parse(readFileSync(dbFile, 'utf-8')); }
    catch { return { _meta: {source:'pc',updated:new Date().toISOString().split('T')[0]}, sets:{} }; }
  };

  const saveDB = (db) => writeFileSync(dbFile, JSON.stringify(db, null, 1));

  let sets = [];
  try {
    sets = await pcConsoleListBy(categorySlug, filterRe, s => s.replace(filterRe, ''));
  } catch (e) {
    console.error(`  ✗ enumeration failed: ${e.message}`);
    return;
  }

  if (!sets.length) {
    console.log(`  ⚠ no sets found`);
    return;
  }

  console.log(`  Found ${sets.length} sets`);

  const db = loadDB();
  const types = SEALED_TYPES_BY[catKey] || [];
  let processed = 0, added = 0;

  for (const {slug, name} of sets.slice(0, 20)) {  // Limit to 20 per category for speed
    if (!db.sets[slug]) db.sets[slug] = {name, products:{}};
    const setRec = db.sets[slug];
    if (!setRec.products) setRec.products = {};

    for (const type of types.slice(0, 5)) {  // Test first 5 types per set
      if (setRec.products[type]) continue;

      try {
        const proxy = nextProxy();
        const browser = await chromium.launch({headless:true, proxy});
        try {
          const {pcSealed} = await import('./lib/pricecharting.mjs');
          const result = await pcSealed(slug, type, browser);
          if (result) {
            setRec.products[type] = result;
            added++;
            console.log(`    ✓ ${slug}/${type}: $${result.current}`);
          }
        } finally { await browser.close(); }
      } catch (e) {}

      await new Promise(r => setTimeout(r, 400));
    }

    processed++;
    if (processed % 5 === 0) {
      db._meta.updated = new Date().toISOString().split('T')[0];
      saveDB(db);
    }
  }

  db._meta.updated = new Date().toISOString().split('T')[0];
  saveDB(db);
  console.log(`  ✓ ${processed} sets, ${added} products`);
}

async function run() {
  console.log('🚀 All-Remaining-Categories Backfill\n');

  // Topps: sports cards
  await backfillCategory('topps', 'topps-cards', /^topps-/, 'set-history-topps.json');

  // Mattel: toys
  await backfillCategory('mattel', 'mattel-dolls', /^mattel-/, 'set-history-mattel.json');

  // One Piece: full expansion
  await backfillCategory('one-piece', 'one-piece-cards', /^one-piece-/, 'set-history-one-piece.json');

  // Sports: general sports cards (union of all sports)
  await backfillCategory('sports', 'sports-cards', /^/, 'set-history-sports.json');

  console.log('\n✓ All categories backfilled');
}

run().catch(e => {console.error('Fatal:', e.message); process.exit(1);});
