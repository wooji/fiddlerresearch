#!/usr/bin/env node
// Find actual premium product types available on PriceCharting for Pokemon sets

import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function findPremium() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();

    // Use a known recent set
    const consoleUrl = 'https://www.pricecharting.com/console/pokemon-chaos-rising';
    console.log(`🔍 Fetching ${consoleUrl}...`);

    const resp = await page.goto(consoleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => {
      console.error(`Failed: ${e.message}`);
      return null;
    });

    if (!resp || resp.status() !== 200) {
      console.error(`Status: ${resp?.status()}`);
      process.exit(1);
    }

    // Get all product links from this set
    const products = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('tr')];
      const items = rows
        .map(tr => {
          const link = tr.querySelector('a[href*="/game/pokemon-"]');
          const price = tr.querySelector('td:nth-child(2)');
          if (!link) return null;
          const href = link.getAttribute('href');
          const text = link.textContent.trim();
          const priceText = price ? price.textContent.trim() : '';
          return { href, text, price: priceText };
        })
        .filter(Boolean)
        .filter(item => item.href.match(/\/game\/pokemon-chaos-rising\/[\w-]+$/))
        .slice(0, 25);

      return items;
    });

    console.log(`\n✓ Found ${products.length} products for Chaos Rising:\n`);
    const premiumKeywords = ['premium', 'ultra', 'deluxe', 'collection'];

    products.forEach((p, i) => {
      const type = p.href.split('/').pop();
      const isPremium = premiumKeywords.some(kw => type.includes(kw) || p.text.toLowerCase().includes(kw));
      const marker = isPremium ? '💎' : '  ';
      console.log(`  ${marker} ${i + 1}. ${p.text.padEnd(40)} → ${type}`);
      if (p.price) console.log(`       Price: ${p.price}`);
    });

    await browser.close();
  } catch (e) {
    console.error('Fatal:', e.message);
    try { await browser.close(); } catch {}
    process.exit(1);
  }
}

findPremium();
