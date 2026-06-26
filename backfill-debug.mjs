#!/usr/bin/env node
/**
 * backfill-debug.mjs
 * Single query test with logging to debug hang
 */

import { wholesaleSearch } from './lib/prices.mjs';

async function test() {
  const query = '1990 Topps baseball';
  console.log(`[debug] query="${query}"`);
  console.log(`[debug] calling wholesaleSearch...`);

  try {
    const start = Date.now();
    const results = await wholesaleSearch(query);
    const elapsed = Math.round((Date.now() - start) / 1000);

    console.log(`[debug] done in ${elapsed}s, got ${results?.length || 0} products`);
    results?.slice(0, 2).forEach(r => console.log(`  - ${r.name}`));
  } catch (e) {
    console.error(`[debug] error:`, e.message);
  }

  process.exit(0);
}

test();
