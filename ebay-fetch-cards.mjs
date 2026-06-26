#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const DBs = {
  pokemon: 'set-history.json',
  one_piece: 'set-history-one-piece.json',
  lorcana: 'set-history-lorcana.json',
  sports: 'set-history-sports.json'
};

const LOG = 'ebay-fetch-cards.log';

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

async function ebayFetchCards(setName, category, proxies, proxyIdx) {
  let browser;
  const cards = [];
  const date = new Date().toISOString().split('T')[0];

  try {
    const proxy = proxies.length > 0 ? proxies[proxyIdx % proxies.length] : undefined;

    browser = await chromium.launch({
      proxy: proxy ? { server: proxy } : undefined,
      headless: true
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(12000);

    // Build search query: set name + "card" + filter to sold listings
    const query = `${setName} card`;
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&rt=nc&LH_Sold=1&LH_Complete=1&_ipg=240`;

    log(`    eBay: ${query.slice(0, 50)}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    } catch (e) {
      log(`      [goto-timeout] ${e.message.split('\n')[0].slice(0, 40)}`);
    }

    // Extract sold listings
    const listings = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('[data-view-url], [id^="item"]').forEach(el => {
        const titleEl = el.querySelector('h3, .s-item__title, [role="heading"]');
        const priceEl = el.querySelector('.s-item__price, [data-test-id="PRICE"]');

        const title = titleEl?.textContent?.trim();
        const priceStr = priceEl?.textContent?.trim();

        if (title && priceStr) {
          const match = priceStr.match(/\$?([\d,]+\.?\d*)/);
          const price = match ? parseFloat(match[1].replace(/,/g, '')) : null;

          if (price && price > 0) {
            items.push({
              title: title.slice(0, 100),
              price: parseFloat(price.toFixed(2))
            });
          }
        }
      });
      return items.slice(0, 50); // Top 50 sold listings
    }).catch(e => {
      log(`      [eval] ${e.message.split('\n')[0]}`);
      return [];
    });

    if (listings.length > 0) {
      listings.forEach((listing, idx) => {
        cards.push({
          cardId: `${setName.replace(/\s+/g, '-')}-ebay-${idx}`,
          name: listing.title,
          market: listing.price,
          priceHistory: [
            { date, price: listing.price, source: 'ebay-sold' }
          ],
          fetchedAt: new Date().toISOString()
        });
      });
    }

    await browser.close();
  } catch (e) {
    log(`    [error] ${e.message.split('\n')[0]}`);
    if (browser) await browser.close().catch(() => {});
  }

  return cards;
}

async function main() {
  log(`[ebay-fetch-cards] ${new Date().toISOString()}`);
  const proxies = loadProxies();
  log(`  Loaded ${proxies.length} proxies`);

  let totalSets = 0, totalCards = 0;
  let proxyIdx = 0;

  for (const [category, dbFile] of Object.entries(DBs)) {
    try {
      const db = JSON.parse(readFileSync(dbFile, 'utf8'));
      const sets = db.sets || db;
      const isNested = !!db.sets;

      log(`\n[${category}] ${Object.keys(sets).length} sets`);
      let catSets = 0, catCards = 0;

      for (const [setKey, set] of Object.entries(sets)) {
        const setName = set.label || set.name || set.set_name || setKey;

        const cards = await ebayFetchCards(setName, category, proxies, proxyIdx);
        proxyIdx += Math.floor(Math.random() * 10);

        if (cards.length > 0) {
          set.cards = set.cards || {};
          set.cards.fullCardList = [...(set.cards.fullCardList || []), ...cards];
          set.cards.fetchedAt = new Date().toISOString();

          catCards += cards.length;
          catSets++;
          totalCards += cards.length;

          const avgPrice = (cards.reduce((s, c) => s + c.market, 0) / cards.length).toFixed(2);
          log(`    ✓ ${setName}: ${cards.length} cards | avg $${avgPrice}`);

          // Throttle: eBay soft limit ~5-10 requests/min
          await new Promise(r => setTimeout(r, 5000 + Math.random() * 3000));
        }
      }

      const output = isNested ? db : sets;
      writeFileSync(dbFile, JSON.stringify(output, null, 2));

      log(`  [${category}] ${catSets} sets, ${catCards} cards`);
      totalSets += catSets;
    } catch (e) {
      log(`  ERROR ${category}: ${e.message}`);
    }
  }

  log(`\n[COMPLETE] ${totalSets} total sets, ${totalCards} total cards\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
