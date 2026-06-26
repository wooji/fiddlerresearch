#!/usr/bin/env node
// Find actual product types listed for a Pokemon set on PriceCharting

import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function probeSetProducts() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();

    const setSlug = 'pokemon-stellar-crown';
    const url = `https://www.pricecharting.com/game/${setSlug}`;
    console.log(`🔍 Fetching ${url}...`);

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => {
      console.error(`Failed to load: ${e.message}`);
      return null;
    });

    if (!resp || resp.status() !== 200) {
      console.error(`Status: ${resp?.status()}`);
      process.exit(1);
    }

    const products = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="/game/pokemon-stellar-crown/"]')]
        .map(a => ({
          href: a.getAttribute('href'),
          text: a.textContent.trim(),
        }))
        .filter(l => l.href && !l.href.includes('?'))
        .filter(l => l.href.match(/\/game\/pokemon-stellar-crown\/[\w-]+$/));

      // Dedupe
      const seen = new Set();
      return links.filter(l => {
        if (seen.has(l.href)) return false;
        seen.add(l.href);
        return true;
      });
    });

    console.log(`\n✓ Found ${products.length} products:\n`);
    products.forEach((p, i) => {
      const type = p.href.split('/').pop();
      console.log(`  ${i + 1}. ${p.text.padEnd(35)} → ${type}`);
    });

    await browser.close();
  } catch (e) {
    console.error('Fatal:', e);
    try { await browser.close(); } catch {}
    process.exit(1);
  }
}

probeSetProducts();
