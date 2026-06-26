#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];
const LOG = 'tcg-fetch-cards-pw.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

function loadProxies() {
  try {
    const isp = readFileSync('C:/Users/Christopher/Desktop/ISP.txt', 'utf8').split('\n').filter(l => l.trim());
    const resi = readFileSync('C:/Users/Christopher/Desktop/heroresi.txt', 'utf8').split('\n').filter(l => l.trim());
    return [...isp, ...resi].map(p => {
      const [host, port, user, pass] = p.split(':');
      return `http://${user}:${pass}@${host}:${port}`;
    });
  } catch { return []; }
}

async function pwFetchCards(productId, setName, proxies, proxyIdx) {
  let browser;
  try {
    const proxy = proxies.length > 0 ? proxies[proxyIdx % proxies.length] : undefined;

    browser = await chromium.launch({
      proxy: proxy ? { server: proxy } : undefined,
      headless: true
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(8000);

    const url = `https://www.tcgplayer.com/search/product?productLineId=${productId}`;
    log(`      → ${url.slice(0, 80)}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(e => {
      log(`        [timeout] ${e.message.split('\n')[0]}`);
    });

    // Extract cards from DOM
    const cards = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('[data-testid="product-listing"]').forEach(el => {
        const name = el.querySelector('[data-testid="product-name"]')?.textContent?.trim();
        const price = el.querySelector('[data-testid="product-price"]')?.textContent?.match(/[\d.]+/)?.[0];
        if (name && price) {
          items.push({ name: name.slice(0, 80), price: parseFloat(price) });
        }
      });
      return items;
    }).catch(e => {
      log(`        [eval] ${e.message.split('\n')[0]}`);
      return [];
    });

    await browser.close();

    if (cards.length > 0) {
      return cards
        .filter(c => c.price > 0)
        .slice(0, 50)  // Top 50 cards
        .map((c, idx) => ({
          cardId: `${setName}-card-${idx}`,
          name: c.name,
          market: parseFloat(c.price.toFixed(2)),
          priceHistory: [
            { date: new Date().toISOString().split('T')[0], price: parseFloat(c.price.toFixed(2)), source: 'tcgplayer' }
          ],
          fetchedAt: new Date().toISOString()
        }));
    }
  } catch (e) {
    log(`      [pw-error] ${e.message.split('\n')[0]}`);
    if (browser) await browser.close().catch(() => {});
  }
  return [];
}

async function main() {
  log(`[tcg-fetch-cards-pw] ${new Date().toISOString()}`);
  const proxies = loadProxies();
  log(`  Loaded ${proxies.length} proxies`);

  let setsUpdated = 0, cardsTotal = 0, proxyIdx = 0;

  for (const dbFile of DBs) {
    try {
      const db = JSON.parse(readFileSync(dbFile, 'utf8'));
      const sets = db.sets || db;
      const isNested = !!db.sets;

      for (const [setKey, set] of Object.entries(sets)) {
        if (!set.tcgId) continue;
        const setName = set.label || set.name || set.set_name || setKey;

        log(`  [${setKey}] scraping ${setName}...`);
        const cards = await pwFetchCards(set.tcgId, setName, proxies, proxyIdx);
        proxyIdx += Math.floor(Math.random() * 10);

        if (cards.length > 0) {
          set.cards = set.cards || {};
          set.cards.fullCardList = cards;
          set.cards.fetchedAt = new Date().toISOString();

          cardsTotal += cards.length;
          setsUpdated++;
          const avg = (cards.reduce((s, c) => s + c.market, 0) / cards.length).toFixed(2);
          log(`    ✓ ${cards.length} cards | avg $${avg}`);
        }
      }

      const output = isNested ? db : sets;
      writeFileSync(dbFile, JSON.stringify(output, null, 2));
    } catch (e) {
      log(`  ERROR ${dbFile}: ${e.message}`);
    }
  }

  log(`[COMPLETE] ${setsUpdated} sets, ${cardsTotal} cards\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
