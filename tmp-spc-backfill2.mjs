/**
 * Backfill real SPC/UPC eBay sold — rotates proxy per product
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const csvPath = 'set-history.csv';
const proxies = readFileSync('proxies-mobilemix.txt', 'utf8').trim().split('\n').filter(Boolean);
const _rp = () => {
  const line = proxies[Math.floor(Math.random() * proxies.length)];
  const [host, port, user, pass] = line.split(':');
  return { server: `http://${host}:${port}`, username: user, password: pass };
};

const targets = [
  ['Generations',              'Mew Mewtwo SPC',       89.99,  'Pokemon Generations Mew Mewtwo Super Premium Collection',         '2016-11'],
  ['Shining Legends',          'Ho-Oh SPC',            99.99,  'Shining Legends Super Premium Collection Ho-Oh sealed',           '2017-10'],
  ['Dragon Majesty',           'Dragonite SPC',       109.99,  'Dragon Majesty Super Premium Collection sealed',                  '2018-09'],
  ['Charizard ex SPC',         'Charizard ex SPC',    119.99,  'Charizard ex Super Premium Collection sealed 2024',               '2024-11'],
  ['Hidden Fates',             'Rayquaza UPC',         99.99,  'Hidden Fates Ultra Premium Collection sealed',                    '2019-08'],
  ['Sword Shield Zacian',      'Zacian Zamazenta UPC', 99.99,  'Sword Shield Ultra Premium Collection Zacian Zamazenta sealed',   '2020-08'],
  ['Celebrations',             'Celebrations UPC',     99.99,  'Celebrations Ultra Premium Collection sealed',                    '2021-10'],
  ['Arceus VSTAR',             'Arceus VSTAR UPC',     99.99,  'Arceus VSTAR Ultra Premium Collection sealed',                    '2022-02'],
  ['Sword Shield Charizard',   'Charizard UPC',        99.99,  'Sword Shield Charizard Ultra Premium Collection sealed',          '2022-10'],
  ['Scarlet Violet 151',       '151 UPC',             119.99,  '151 Ultra Premium Collection sealed',                            '2023-09'],
  ['Terapagos ex',             'Terapagos UPC',       119.99,  'Terapagos ex Ultra Premium Collection sealed',                   '2024-11'],
  ['Mega Charizard X ex',      'Mega Charizard UPC',  129.99,  'Mega Charizard X ex Ultra Premium Collection sealed',            '2025-03'],
  ["Team Rocket Moltres ex",   'Moltres UPC',         129.99,  "Team Rocket Moltres ex Ultra Premium Collection sealed",         '2025-06'],
  ['30th Celebration',         '30th UPC',            149.99,  '30th Celebration Ultra Premium Collection sealed',               '2026-07'],
];

const results = [];

for (const [setName, prodLabel, msrp, query, histFrom] of targets) {
  let page;
  let browser;
  let gotData = false;
  // Try up to 3 proxy rotations per product
  for (let attempt = 0; attempt < 3 && !gotData; attempt++) {
    const proxy = _rp();
    try {
      browser = await chromium.launch({ headless: true, proxy: { server: proxy.server, username: proxy.username, password: proxy.password } });
      const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' });
      page = await ctx.newPage();
      const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=20`;
      await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
      await page.waitForSelector('li.s-item, li.s-card', { timeout: 6000 }).catch(() => {});
      const items = await page.$$eval('li.s-item, li.s-card', els => els.map(el => ({
        title: el.querySelector('[class*="title"], h3, .s-item__title')?.textContent?.trim() ?? '',
        price: el.querySelector('[class*="price"]')?.textContent?.replace(/[^0-9.]/g, '') ?? '',
      }))).catch(() => []);

      const sold = items
        .filter(x => x.title && x.title !== 'Shop on eBay' && !/psa|bgs|cgc|graded|lot of|\bcard #\b/i.test(x.title))
        .map(x => parseFloat(x.price))
        .filter(p => Number.isFinite(p) && p > 20)
        .sort((a, b) => a - b);

      const median = sold.length ? sold[Math.floor(sold.length / 2)] : null;
      const multNow = median ? +(median / msrp).toFixed(2) : null;
      console.log(`${setName} | ${prodLabel} | n=${sold.length} | median=$${median ?? 'n/a'} | ${multNow ?? 'n/a'}× | msrp=$${msrp}`);
      if (median && multNow) {
        results.push({ setName, prodLabel, msrp, market: median, multNow, histFrom });
        gotData = true;
      } else {
        console.log(`  attempt ${attempt+1}: no data`);
      }
    } catch (e) {
      console.log(`${setName} attempt ${attempt+1} ERR: ${e.message.slice(0, 60)}`);
    } finally {
      await browser?.close().catch(() => {});
    }
  }
}

// Append verified rows (remove dupes for sets already in CSV by set+prodLabel)
const existing = readFileSync(csvPath, 'utf8').trimEnd();
const existingLines = existing.split('\n');
const newRows = results
  .filter(r => !existingLines.some(l => l.startsWith(`${r.setName},${r.prodLabel}`)))
  .map(r => `${r.setName},${r.prodLabel} (SPC/UPC),${r.msrp},${r.market},${r.market},${r.multNow},${r.multNow},${r.histFrom},spc,Y`);

writeFileSync(csvPath, existing + '\n' + newRows.join('\n') + '\n');
console.log(`\nAppended ${newRows.length} new rows`);
console.log('--- RESULTS ---');
results.sort((a,b) => a.histFrom.localeCompare(b.histFrom))
  .forEach(r => console.log(`${r.histFrom} | ${r.setName} ${r.prodLabel}: $${r.market} (${r.multNow}× retail from $${r.msrp})`));
