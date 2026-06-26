#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const DBs = ['set-history.json'];
const LOG = 'tcg-fetch-cards-pw-simple.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

async function pwFetchCards(productId, setName) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);

    const url = `https://www.tcgplayer.com/search/product?productLineId=${productId}`;
    log(`  Fetching: ${url.slice(0, 80)}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
    } catch (e) {
      log(`    [goto] ${e.message.split('\n')[0]}`);
    }

    // Extract cards
    const cards = await page.locator('[data-testid="product-name"]').all().then(async els => {
      const items = [];
      for (const el of els.slice(0, 50)) {
        try {
          const text = await el.textContent();
          if (text) items.push({ name: text.trim().slice(0, 80) });
        } catch {}
      }
      return items;
    }).catch(e => {
      log(`    [extract] ${e.message.split('\n')[0]}`);
      return [];
    });

    await browser.close();

    if (cards.length > 0) {
      return cards.map((c, idx) => ({
        cardId: `card-${idx}`,
        name: c.name,
        market: 15.00 + Math.random() * 10,  // Dummy price for now
        priceHistory: [{ date: new Date().toISOString().split('T')[0], price: 15.00, source: 'tcgplayer' }],
        fetchedAt: new Date().toISOString()
      }));
    }
  } catch (e) {
    log(`  [error] ${e.message.split('\n')[0]}`);
    if (browser) await browser.close().catch(() => {});
  }
  return [];
}

async function main() {
  log(`[tcg-fetch-cards-pw-simple] ${new Date().toISOString()}`);

  try {
    const db = JSON.parse(readFileSync(DBs[0], 'utf8'));
    const sets = db.sets || db;

    let tested = 0;
    for (const [setKey, set] of Object.entries(sets)) {
      if (!set.tcgId || tested >= 1) continue;  // Test 1 set only
      tested++;

      const setName = set.label || set.name || set.set_name || setKey;
      log(`\n[${setKey}] ${setName}`);

      const cards = await pwFetchCards(set.tcgId, setName);
      log(`  ✓ ${cards.length} cards found`);

      if (cards.length > 0) {
        log(`  Sample: ${cards[0].name}`);
      }
    }
  } catch (e) {
    log(`FATAL: ${e.message}`);
  }
}

main().catch(e => { log(`ERROR: ${e.message}`); process.exit(1); });
