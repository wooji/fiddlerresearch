#!/usr/bin/env node
// Backfill One Piece TCG: booster-boxes, double-boxes, collections across all sets
// Run: node backfill-one-piece.mjs [proxy-file] [limit]

import { readFileSync, writeFileSync } from 'fs';
import { pcConsoleListBy, pcSealedTypes, SEALED_TYPES_BY } from './lib/pricecharting.mjs';
import { chromium } from 'playwright';

const PROXY_LIST = [];
let proxyIdx = 0;

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

function nextProxy() {
  if (!PROXY_LIST.length) return null;
  const p = PROXY_LIST[proxyIdx % PROXY_LIST.length];
  proxyIdx++;
  return p;
}

function loadDB() {
  try { return JSON.parse(readFileSync('set-history-one-piece.json', 'utf-8')); }
  catch { return { _meta: { source: 'pricecharting', updated: new Date().toISOString().split('T')[0] }, sets: {} }; }
}

function saveDB(db) {
  writeFileSync('set-history-one-piece.json', JSON.stringify(db, null, 1));
}

async function scrapeWithProxy(setSlug, type) {
  for (let i = 0; i < 2; i++) {
    try {
      const proxy = nextProxy();
      const browser = await chromium.launch({ headless: true, proxy });
      try {
        const { pcSealed } = await import('./lib/pricecharting.mjs');
        const result = await pcSealed(setSlug, type, browser);
        await browser.close();
        return result;
      } catch (e) {
        await browser.close();
        throw e;
      }
    } catch (e) {
      if (i < 1) await new Promise(r => setTimeout(r, 3000));
    }
  }
  return null;
}

async function backfill() {
  const proxyFile = process.argv[2];
  const limit = parseInt(process.argv[3]) || 0;

  PROXY_LIST.push(...readProxies(proxyFile));

  console.log(`📥 One Piece TCG Backfill`);
  console.log(`  Proxies: ${PROXY_LIST.length}`);

  // Enumerate One Piece sets from PriceCharting
  let opSets = [];
  try {
    opSets = await pcConsoleListBy('one-piece-cards', /^one-piece-/, s => s.replace(/^one-piece-/, ''));
  } catch (e) {
    console.error(`Failed to enumerate: ${e.message}`);
    process.exit(1);
  }

  if (!opSets.length) {
    console.error('❌ No One Piece sets found');
    process.exit(1);
  }

  console.log(`  Found ${opSets.length} sets\n`);

  const db = loadDB();
  const types = ['booster-box', 'double-box', 'collection-box'];

  let processed = 0, added = 0;

  for (const { slug, name } of opSets) {
    if (limit > 0 && processed >= limit) break;
    processed++;

    if (!db.sets[slug]) db.sets[slug] = { name, products: {} };

    const setRec = db.sets[slug];
    if (!setRec.products) setRec.products = {};

    for (const type of types) {
      if (setRec.products[type]) continue;

      const result = await scrapeWithProxy(slug, type);
      if (result) {
        setRec.products[type] = result;
        console.log(`  ✓ ${name}/${type}: $${result.current} (ATH $${result.ath})`);
        added++;
      } else {
        console.log(`  ~ ${name}/${type}: no data`);
      }

      await new Promise(r => setTimeout(r, 800));
    }

    if (processed % 5 === 0) {
      db._meta.updated = new Date().toISOString().split('T')[0];
      saveDB(db);
      console.log(`  [saved @ ${processed} sets]\n`);
    }
  }

  db._meta.updated = new Date().toISOString().split('T')[0];
  saveDB(db);

  console.log(`\n✓ One Piece backfill: ${processed} sets, ${added} products added`);
}

backfill().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
