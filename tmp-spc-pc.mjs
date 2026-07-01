/**
 * Pull SPC/UPC prices from PriceCharting search results
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const csvPath = 'set-history.csv';

const targets = [
  // [label, msrp, searchQuery, histFrom]
  ['Generations',          89.99,  'mew mewtwo super premium collection',               '2016-11'],
  ['Shining Legends',      99.99,  'ho-oh super premium collection shining legends',    '2017-10'],
  ['Dragon Majesty',      109.99,  'dragon majesty super premium collection',           '2018-09'],
  ['Charizard ex SPC',    119.99,  'charizard ex super premium collection 2024',        '2024-11'],
  ['Hidden Fates',         99.99,  'hidden fates ultra premium collection rayquaza',    '2019-08'],
  ['Sword Shield Zacian',  99.99,  'zacian zamazenta ultra premium collection',         '2020-08'],
  ['Celebrations',         99.99,  'celebrations ultra premium collection pikachu',     '2021-10'],
  ['Arceus VSTAR',         99.99,  'arceus vstar ultra premium collection',             '2022-02'],
  ['Sword Shield Charizard',99.99, 'charizard ultra premium collection sword shield',  '2022-10'],
  ['Scarlet Violet 151',  119.99,  '151 ultra premium collection mew',                 '2023-09'],
  ['Terapagos ex',        119.99,  'terapagos ultra premium collection',               '2024-11'],
  ['Mega Charizard X ex', 129.99,  'mega charizard x ultra premium collection',        '2025-03'],
  ['Team Rocket Moltres', 129.99,  "team rocket moltres ultra premium collection",     '2025-06'],
  ['30th Celebration',    149.99,  '30th anniversary ultra premium collection pokemon', '2026-07'],
];

const results = [];

for (const [label, msrp, q, histFrom] of targets) {
  const enc = encodeURIComponent(q);
  const url = `https://www.pricecharting.com/search-products?q=${enc}&type=prices`;
  try {
    const html = execFileSync('curl', ['-sL', '--max-time', '15', '-A', 'Mozilla/5.0', url], { encoding: 'utf8' });
    const tbIdx = html.indexOf('<tbody>');
    const slice = html.slice(tbIdx, tbIdx + 30000);

    // Find rows with 'collection' or 'ultra premium' or 'super premium' in the product name
    const rowPattern = /<tr[^>]*data-product="\d+"[\s\S]{0,2000}?<\/tr>/g;
    const rows = [...slice.matchAll(rowPattern)];

    let best = null;
    for (const row of rows) {
      const text = row[0];
      const href = text.match(/href="(\/game\/[^"]+)"/)?.[1] ?? '';
      const name = text.match(/>([^<]{5,80})<\/a>[\s\S]{0,100}?<a href="\/console/)?.[1]?.trim()
               ?? text.match(/onclick[^>]+>\s*([^<]{5,80})<\/a>/)?.[1]?.trim() ?? '';
      const price = text.match(/class="[^"]*used_price[^"]*"[\s\S]{0,200}?<span[^>]*>\$([0-9,.]+)/)?.[1]
                 ?? text.match(/class="js-price">\$([0-9,.]+)/)?.[1];

      if (/collection|ultra.premium|super.premium|premium.collection/i.test(name) && price) {
        const mkt = parseFloat(price.replace(/,/g, ''));
        if (mkt > 20) { best = { name, price: mkt, href }; break; }
      }
    }

    if (best) {
      const mult = +(best.price / msrp).toFixed(2);
      console.log(`${label} | ${best.name} | $${best.price} | ${mult}× | ${best.href}`);
      results.push({ label, msrp, market: best.price, multNow: mult, histFrom, prodName: best.name });
    } else {
      console.log(`${label} | NO MATCH | searched: "${q}"`);
    }
  } catch (e) {
    console.log(`${label} ERR: ${e.message.slice(0, 60)}`);
  }
}

console.log('\n--- SUMMARY ---');
results.sort((a,b) => a.histFrom.localeCompare(b.histFrom))
  .forEach(r => console.log(`${r.histFrom} | ${r.label}: $${r.market} (${r.multNow}×)`));

// Write rows to CSV (skip dupes)
const existing = readFileSync(csvPath, 'utf8').trimEnd();
const existingLines = existing.split('\n');
const newRows = results
  .filter(r => !existingLines.some(l => l.startsWith(`${r.label},`)))
  .map(r => `${r.label},${r.prodName} (SPC/UPC),${r.msrp},${r.market},${r.market},${r.multNow},${r.multNow},${r.histFrom},spc,Y`);

if (newRows.length) {
  writeFileSync(csvPath, existing + '\n' + newRows.join('\n') + '\n');
  console.log(`\nAppended ${newRows.length} rows to set-history.csv`);
}
