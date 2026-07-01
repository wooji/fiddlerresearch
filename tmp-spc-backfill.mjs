/**
 * Backfill real SPC/UPC eBay sold prices into set-history.csv
 * Removes wrong rows first, then appends verified data
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

// Remove the 4 wrong rows I added previously
const csvPath = 'set-history.csv';
let csv = readFileSync(csvPath, 'utf8');
const wrongSets = ['Crown Zenith,Super/Ultra Premium', 'Obsidian Flames,Super/Ultra Premium',
  'Paradox Rift,Super/Ultra Premium', 'Paldean Fates,Super/Ultra Premium'];
csv = csv.split('\n').filter(line => !wrongSets.some(w => line.startsWith(w))).join('\n');
if (!csv.endsWith('\n')) csv += '\n';
writeFileSync(csvPath, csv);
console.log('Removed wrong rows');

// Real SPC/UPC products with verified MSRPs
const targets = [
  // SPCs
  ['Generations',         'Mew Mewtwo SPC',          89.99,  'Pokemon Generations Mew Mewtwo Super Premium Collection sealed', '2016-11', 'spc'],
  ['Shining Legends',     'Ho-Oh SPC',                99.99,  'Shining Legends Super Premium Collection Ho-Oh sealed',         '2017-10', 'spc'],
  ['Dragon Majesty',      'Dragonite SPC',           109.99,  'Dragon Majesty Super Premium Collection sealed',                '2018-09', 'spc'],
  ['Charizard ex SPC',    'Charizard ex SPC',        119.99,  'Charizard ex Super Premium Collection sealed',                  '2024-11', 'spc'],
  // UPCs
  ['Hidden Fates',        'Rayquaza UPC',             99.99,  'Hidden Fates Ultra Premium Collection sealed',                  '2019-08', 'spc'],
  ['Sword & Shield',      'Zacian Zamazenta UPC',     99.99,  'Pokemon Sword Shield Ultra Premium Collection Zacian Zamazenta sealed', '2020-08', 'spc'],
  ['Celebrations',        'Celebrations UPC',         99.99,  'Celebrations Ultra Premium Collection sealed box',               '2021-10', 'spc'],
  ['Arceus VSTAR',        'Arceus VSTAR UPC',         99.99,  'Arceus VSTAR Ultra Premium Collection sealed',                  '2022-02', 'spc'],
  ['Sword & Shield',      'Charizard UPC',            99.99,  'Pokemon Sword Shield Charizard Ultra Premium Collection sealed', '2022-10', 'spc'],
  ['Scarlet & Violet 151','Mew 151 UPC',             119.99,  '151 Ultra Premium Collection sealed box',                       '2023-09', 'spc'],
  ['Terapagos ex',        'Terapagos UPC',           119.99,  'Terapagos ex Ultra Premium Collection sealed',                  '2024-11', 'spc'],
  ['Mega Charizard X ex', 'Mega Charizard UPC',      129.99,  'Mega Charizard X ex Ultra Premium Collection sealed',           '2025-03', 'spc'],
  ["Team Rocket's Moltres ex", 'Moltres UPC',        129.99,  "Team Rocket's Moltres ex Ultra Premium Collection sealed",      '2025-06', 'spc'],
  ['30th Celebration',    '30th Day Night UPC',      149.99,  '30th Celebration Ultra Premium Collection sealed',              '2026-07', 'spc'],
];

const proxies = readFileSync('proxies-mobilemix.txt', 'utf8').trim().split('\n').filter(Boolean);
const _rp = () => {
  const line = proxies[Math.floor(Math.random() * proxies.length)];
  const [host, port, user, pass] = line.split(':');
  return { server: `http://${host}:${port}`, username: user, password: pass };
};

const proxy = _rp();
const browser = await chromium.launch({ headless: true, proxy: { server: proxy.server, username: proxy.username, password: proxy.password } });
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' });

const results = [];

for (const [setName, prodLabel, msrp, query, histFrom, rank] of targets) {
  const page = await ctx.newPage();
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=20`;
  try {
    await page.goto(url, { timeout: 25000, waitUntil: 'domcontentloaded' });
    await page.waitForSelector('li.s-item, li.s-card', { timeout: 8000 }).catch(() => {});
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
    console.log(`${setName} | ${prodLabel} | n=${sold.length} | median=$${median ?? 'n/a'} | mult=${multNow ?? 'n/a'}× | msrp=$${msrp}`);
    if (median && multNow) results.push({ setName, prodLabel, msrp, market: median, multNow, histFrom, rank });
  } catch (e) {
    console.log(`${setName} ERR: ${e.message.slice(0, 80)}`);
  }
  await page.close();
}

await browser.close();

// Append verified rows to CSV
const newRows = results.map(r =>
  `${r.setName},${r.prodLabel} (SPC/UPC),${r.msrp},${r.market},${r.market},${r.multNow},${r.multNow},${r.histFrom},${r.rank},Y`
).join('\n') + '\n';

const existing = readFileSync(csvPath, 'utf8');
writeFileSync(csvPath, existing.trimEnd() + '\n' + newRows);
console.log(`\nAppended ${results.length} rows to set-history.csv`);
console.log('\n--- VERIFIED DATA ---');
results.forEach(r => console.log(`${r.setName} ${r.prodLabel}: $${r.market} (${r.multNow}×)`));
