#!/usr/bin/env node
// Enumerate actual Pokemon set slugs from PriceCharting category

import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function probeCategory() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();

    const url = 'https://www.pricecharting.com/category/pokemon-cards';
    console.log(`🔍 Fetching ${url}...`);

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => {
      console.error(`Failed: ${e.message}`);
      return null;
    });

    if (!resp || resp.status() !== 200) {
      console.error(`Status: ${resp?.status()}`);
      process.exit(1);
    }

    const sets = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href^="/console/pokemon"]')]
        .map(a => ({
          href: a.getAttribute('href'),
          text: a.textContent.trim(),
        }))
        .filter(l => l.href && /^\/console\/pokemon-/.test(l.href) && !l.href.includes('?'))
        .filter((l, i, arr) => arr.findIndex(x => x.href === l.href) === i); // Dedupe

      return links.slice(0, 15); // First 15
    });

    console.log(`\n✓ Found ${sets.length} recent sets:\n`);
    sets.forEach((s, i) => {
      const slug = s.href.replace('/console/', '');
      console.log(`  ${i + 1}. ${s.text.padEnd(30)} → ${slug}`);
    });

    // Now enumerate products for the first set
    if (sets.length > 0) {
      const firstSet = sets[0].href.replace('/console/', '').replace(/^pokemon-/, 'pokemon-').slice(0, -1);
      console.log(`\n📌 Probing products for first set...`);

      // Get the game page for the first set
      const gameUrl = `https://www.pricecharting.com/game/${sets[0].href.replace('/console/', '')}`;
      console.log(`  URL: ${gameUrl}`);

      const gameResp = await page.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      if (gameResp && gameResp.status() === 200) {
        const products = await page.evaluate(() => {
          const links = [...document.querySelectorAll('a[href*="/game/pokemon"]')]
            .map(a => a.getAttribute('href'))
            .filter(h => h && h.match(/\/game\/pokemon-[\w-]+\/[\w-]+$/))
            .filter((h, i, arr) => arr.indexOf(h) === i); // Dedupe

          return links.slice(0, 12).map(h => h.split('/').pop());
        });

        console.log(`\n  Products found: ${products.join(', ')}`);
      }
    }

    await browser.close();
  } catch (e) {
    console.error('Fatal:', e);
    try { await browser.close(); } catch {}
    process.exit(1);
  }
}

probeCategory();
