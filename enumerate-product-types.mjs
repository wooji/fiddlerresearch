#!/usr/bin/env node
// Enumerate available product types by testing common names for a set

import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const CANDIDATE_TYPES = [
  'booster-box',
  'elite-trainer-box',
  'booster-bundle',
  'booster-pack',
  'premium-collection',
  'ultra-premium-collection',
  'super-premium-collection',
  'deluxe-collection',
  'collection-box',
  'special-collection',
  'premium-box',
  'blister-pack',
  '3-pack-blister',
  '2-pack-blister',
  'jumbo-collection',
];

async function enumerateTypes() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();

    const set = 'pokemon-chaos-rising';
    console.log(`📊 Checking product types for ${set}...\n`);

    const found = [];

    for (const type of CANDIDATE_TYPES) {
      const url = `https://www.pricecharting.com/game/${set}/${type}`;
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);

      if (!resp) {
        console.log(`  ✗ ${type.padEnd(30)} (timeout)`);
        continue;
      }

      if (resp.status() !== 200) {
        console.log(`  ✗ ${type.padEnd(30)} (${resp.status()})`);
        continue;
      }

      // Check if it has price data
      const hasPrice = await page.evaluate(() => {
        const s = [...document.querySelectorAll('script')].map(x => x.textContent).join('\n');
        const hasCh = s.includes('chart_data');
        const isList = !!document.querySelector('table#games_table, .product-list');
        return hasCh && !isList;
      });

      if (hasPrice) {
        console.log(`  ✓ ${type.padEnd(30)} (HAS DATA)`);
        found.push(type);
      } else {
        console.log(`  ~ ${type.padEnd(30)} (no price data)`);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n✓ Found ${found.length} valid product types:`);
    found.forEach(t => console.log(`  - ${t}`));

    await browser.close();
  } catch (e) {
    console.error('Fatal:', e.message);
    process.exit(1);
  }
}

enumerateTypes();
