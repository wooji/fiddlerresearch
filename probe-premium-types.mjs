#!/usr/bin/env node
// Probe PriceCharting for actual premium collection product slugs
// Run: node probe-premium-types.mjs

import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function probeSet() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();

    // Pick a recent set (Stellar Crown) — should have multiple product types
    const setSlug = 'pokemon-stellar-crown';
    console.log(`🔍 Probing ${setSlug}...`);

    // Try various premium type slugs
    const toTry = [
      'premium-collection',
      'ultimate-premium-collection',
      'super-premium-collection',
      'ultra-premium-collection',
      'deluxe-collection',
      'collection-box',
      'special-collection',
      'premium-box',
      'jumbo-collection', // Sometimes used
      'premium-figure-collection',
    ];

    for (const type of toTry) {
      const url = `https://www.pricecharting.com/game/${setSlug}/${type}`;
      try {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => null);
        if (!resp || resp.status() !== 200) {
          console.log(`  ✗ ${type} (404)`);
          continue;
        }

        const raw = await page.evaluate(() => {
          const s = [...document.querySelectorAll('script')].map(x => x.textContent).join('\n');
          const m = s.match(/chart_data\s*=\s*(\{.*?\});/s);
          const isList = !!document.querySelector('table#games_table, .product-list') && !document.querySelector('#price_data');
          const pageTitle = document.title;
          return { chart: !!m, isList, pageTitle };
        });

        if (raw.isList) {
          console.log(`  ? ${type} (list page)`);
        } else if (raw.chart) {
          console.log(`  ✓ ${type} (has price data)`);
        } else {
          console.log(`  ~ ${type} (page exists, no chart data)`);
        }
      } catch (e) {
        console.log(`  ✗ ${type} (error: ${e.message.slice(0, 30)})`);
      }

      await new Promise(r => setTimeout(r, 800));
    }

    await browser.close();
  } catch (e) {
    console.error('Fatal:', e);
    try { await browser.close(); } catch {}
    process.exit(1);
  }
}

probeSet();
