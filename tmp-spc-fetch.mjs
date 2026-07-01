import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const BASE = 'https://www.pricecharting.com';
const csvPath = 'set-history.csv';

// Confirmed direct URLs from console browse
const knownUrls = [
  ['Generations',        89.99,  '/game/pokemon-generations/super-premium-collection-box-mew-and-mewtwo',          '2016-11'],
  ['Shining Legends',    99.99,  '/game/pokemon-shining-legends/super-premium-collection-box',                      '2017-10'],
  ['Dragon Majesty',    109.99,  '/game/pokemon-dragon-majesty/super-premium-collection-box',                       '2018-09'],
  ['Hidden Fates',       99.99,  '/game/pokemon-hidden-fates/ultra-premium-collection-box',                         '2019-08'],
  ['Celebrations',       99.99,  '/game/pokemon-celebrations/ultra-premium-collection-box',                         '2021-10'],
  ['Scarlet Violet 151',119.99,  '/game/pokemon-scarlet-&-violet-151/ultra-premium-collection-box',                 '2023-09'],
  ['Team Rocket Moltres',129.99, "/game/pokemon-promo/team-rocket's-moltres-ex-ultra-premium-collection-box",       '2025-06'],
];

// Need to find: Charizard ex SPC, Zacian/Zamazenta UPC, Arceus VSTAR UPC, SS Charizard UPC, Terapagos UPC, Mega Charizard UPC, 30th UPC
const searchConsoles = [
  ['Charizard ex SPC',   119.99, ['pokemon-obsidian-flames','pokemon-scarlet-and-violet-base-set','pokemon-promo'], '2024-11'],
  ['Zacian Zamazenta UPC', 99.99,['pokemon-sword-and-shield-base-set','pokemon-vivid-voltage','pokemon-champion-path'],'2020-08'],
  ['Arceus VSTAR UPC',   99.99,  ['pokemon-brilliant-stars','pokemon-astral-radiance','pokemon-fusion-strike'],     '2022-02'],
  ['SS Charizard UPC',   99.99,  ['pokemon-silver-tempest','pokemon-lost-origin','pokemon-astral-radiance'],        '2022-10'],
  ['Terapagos ex UPC',  119.99,  ['pokemon-stellar-crown','pokemon-twilight-masquerade','pokemon-shrouded-fable'], '2024-11'],
  ['Mega Charizard UPC',129.99,  ['pokemon-surging-sparks','pokemon-prismatic-evolutions','pokemon-promo'],         '2025-03'],
  ['30th UPC',          149.99,  ['pokemon-destined-rivals','pokemon-promo','pokemon-surging-sparks'],              '2026-07'],
];

const get = (path) => execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0', BASE + path], { encoding: 'utf8' });

const extractPrice = (html) => {
  const block = html.match(/id="used_price"[\s\S]{0,500}/)?.[0];
  const p = block?.match(/\$([0-9,.]+)/)?.[1];
  return p ? parseFloat(p.replace(/,/g, '')) : null;
};

const results = [];

// Fetch known URLs
for (const [label, msrp, path, histFrom] of knownUrls) {
  try {
    const html = get(path);
    const price = extractPrice(html);
    const title = html.match(/<title>([^<|]+)/)?.[1]?.trim();
    if (price) {
      const mult = +(price / msrp).toFixed(2);
      console.log(`✓ ${label} | $${price} | ${mult}× | ${title?.slice(0,50)}`);
      results.push({ label, msrp, market: price, multNow: mult, histFrom, prodName: title?.split(' Prices')[0] ?? label });
    } else {
      console.log(`✗ ${label} | no used_price | ${title?.slice(0,50)}`);
    }
  } catch (e) { console.log(`${label} ERR: ${e.message.slice(0,50)}`); }
}

// Search consoles for unknowns
for (const [label, msrp, slugs, histFrom] of searchConsoles) {
  let found = false;
  for (const slug of slugs) {
    if (found) break;
    try {
      const html = get(`/console/${slug}`);
      const links = [...html.matchAll(/href="(\/game\/[^"]+)"[^>]*>([^<]{5,80})<\/a>/g)]
        .filter(m => /ultra.premium|super.premium/i.test(m[2]));
      for (const [, href, name] of links) {
        const ph = get(href);
        const price = extractPrice(ph);
        if (price) {
          const mult = +(price / msrp).toFixed(2);
          console.log(`✓ ${label} | ${name.trim()} | $${price} | ${mult}× | ${href}`);
          results.push({ label, msrp, market: price, multNow: mult, histFrom, prodName: name.trim() });
          found = true; break;
        }
      }
    } catch {}
  }
  if (!found) console.log(`✗ ${label} | not found in: ${slugs.join(', ')}`);
}

console.log('\n--- ALL SPC/UPC COMPS ---');
results.sort((a,b) => a.histFrom.localeCompare(b.histFrom))
  .forEach(r => console.log(`${r.histFrom} ${r.label}: $${r.market} (${r.multNow}× retail from $${r.msrp})`));

// Write to CSV
const existing = readFileSync(csvPath, 'utf8').trimEnd();
const existingLines = existing.split('\n');
const newRows = results
  .filter(r => !existingLines.some(l => l.startsWith(`${r.label},`)))
  .map(r => `${r.label},${r.prodName} (SPC/UPC),${r.msrp},${r.market},${r.market},${r.multNow},${r.multNow},${r.histFrom},spc,Y`);

if (newRows.length) {
  writeFileSync(csvPath, existing + '\n' + newRows.join('\n') + '\n');
  console.log(`\nAppended ${newRows.length} rows to CSV`);
}
