import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const csvPath = 'set-history.csv';

// Remove all wrong/contaminated SPC rows and restart clean
let csv = readFileSync(csvPath, 'utf8');
const badPrefixes = [
  'Charizard ex SPC,',
  'Mega Charizard UPC,',
  '30th UPC,',
  'Sword Shield Charizard UPC,',  // card price not sealed
  'Sword Shield Zacian UPC,',      // Moltres price
  'Terapagos ex UPC,',             // card price
];
const before = csv.split('\n').filter(l => l.includes(',spc,')).length;
csv = csv.split('\n').filter(l => !badPrefixes.some(p => l.startsWith(p))).join('\n');
if (!csv.endsWith('\n')) csv += '\n';
writeFileSync(csvPath, csv);
const after = readFileSync(csvPath,'utf8').split('\n').filter(l => l.includes(',spc,')).length;
console.log(`Removed ${before - after} bad rows`);

// Now try to get the 3 remaining unknown products from PriceCharting directly
// Try specific product slugs we didn't find yet
const BASE = 'https://www.pricecharting.com';
const get = (path) => execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0', BASE + path], { encoding: 'utf8' });
const extractSealed = (html) => {
  // Must be a product page (has id="used_price") not a list page
  if (!html.includes('id="used_price"')) return null;
  const block = html.match(/id="used_price"[\s\S]{0,500}/)?.[0];
  const p = block?.match(/\$([0-9,.]+)/)?.[1];
  return p ? parseFloat(p.replace(/,/g,'')) : null;
};

const toTry = [
  // [label, msrp, histFrom, slugs...]
  ['Sword Shield Zacian UPC', 99.99, '2020-08', [
    '/game/pokemon-sword-and-shield-base-set/ultra-premium-collection-box',
    '/game/pokemon-sword-and-shield/ultra-premium-collection-zacian-and-zamazenta',
    '/game/pokemon-vivid-voltage/ultra-premium-collection-zacian-and-zamazenta-box',
    '/game/pokemon-promo/ultra-premium-collection-zacian-and-zamazenta-box',
  ]],
  ['Sword Shield Charizard UPC', 99.99, '2022-10', [
    '/game/pokemon-sword-and-shield-base-set/charizard-ultra-premium-collection-box',
    '/game/pokemon-silver-tempest/charizard-ultra-premium-collection-box',
    '/game/pokemon-celebrations/charizard-ultra-premium-collection-box',
    '/game/pokemon-promo/charizard-ultra-premium-collection-box',
  ]],
  ['Charizard ex SPC 2024', 119.99, '2024-11', [
    '/game/pokemon-obsidian-flames/charizard-ex-super-premium-collection-box',
    '/game/pokemon-promo/charizard-ex-super-premium-collection-box',
    '/game/pokemon-scarlet-and-violet-base-set/charizard-ex-super-premium-collection-box',
  ]],
  ['Terapagos ex UPC', 119.99, '2024-11', [
    '/game/pokemon-stellar-crown/terapagos-ex-ultra-premium-collection-box',
    '/game/pokemon-promo/terapagos-ex-ultra-premium-collection-box',
    '/game/pokemon-twilight-masquerade/terapagos-ex-ultra-premium-collection-box',
  ]],
  ['Mega Charizard X ex UPC', 129.99, '2025-03', [
    '/game/pokemon-promo/mega-charizard-x-ex-ultra-premium-collection-box',
    '/game/pokemon-destined-rivals/mega-charizard-x-ex-ultra-premium-collection-box',
    '/game/pokemon-prismatic-evolutions/mega-charizard-x-ex-ultra-premium-collection-box',
  ]],
];

const results = [];
for (const [label, msrp, histFrom, slugs] of toTry) {
  let found = false;
  for (const slug of slugs) {
    try {
      const html = get(slug);
      const price = extractSealed(html);
      if (price) {
        const mult = +(price/msrp).toFixed(2);
        const title = html.match(/<title>([^<|]+)/)?.[1]?.trim() ?? label;
        console.log(`✓ ${label} | $${price} | ${mult}× | ${title.slice(0,50)}`);
        results.push({ label, msrp, market: price, multNow: mult, histFrom, prodName: title.split(' Prices')[0] });
        found = true; break;
      }
    } catch {}
  }
  if (!found) console.log(`✗ ${label} | not found on PriceCharting`);
}

// Append
if (results.length) {
  const existing = readFileSync(csvPath,'utf8').trimEnd();
  const existingLines = existing.split('\n');
  const newRows = results
    .filter(r => !existingLines.some(l => l.startsWith(`${r.label},`)))
    .map(r => `${r.label},${r.prodName} (SPC/UPC),${r.msrp},${r.market},${r.market},${r.multNow},${r.multNow},${r.histFrom},spc,Y`);
  if (newRows.length) {
    writeFileSync(csvPath, existing + '\n' + newRows.join('\n') + '\n');
    console.log(`Appended ${newRows.length} rows`);
  }
}

console.log('\n=== VERIFIED SPC/UPC ROWS ===');
readFileSync(csvPath,'utf8').split('\n').filter(l => l.includes(',spc,')).sort().forEach(l => {
  const p = l.split(','); console.log(`${p[7]?.trim()} | ${p[0]}: $${p[3]} (${p[5]}×)`);
});
