import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const csvPath = 'set-history.csv';

// 1. Remove wrong rows
let csv = readFileSync(csvPath, 'utf8');
const badPrefixes = ['Charizard ex SPC,', 'Mega Charizard UPC,', '30th UPC,'];
csv = csv.split('\n').filter(l => !badPrefixes.some(p => l.startsWith(p))).join('\n');
if (!csv.endsWith('\n')) csv += '\n';
writeFileSync(csvPath, csv);
console.log('Removed wrong rows');

const BASE = 'https://www.pricecharting.com';
const get = (path) => execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0', BASE + path], { encoding: 'utf8' });
const extractPrice = (html) => {
  const block = html.match(/id="used_price"[\s\S]{0,500}/)?.[0];
  const p = block?.match(/\$([0-9,.]+)/)?.[1];
  return p ? parseFloat(p.replace(/,/g,'')) : null;
};

// 2. Find missing products
const findInConsole = (slug, keywordRx) => {
  const html = get(`/console/${slug}`);
  const links = [...html.matchAll(/href="(\/game\/[^"]+)"[^>]*>([^<]{5,80})<\/a>/g)]
    .filter(m => keywordRx.test(m[2]))
    .map(m => ({ href: m[1], name: m[2].trim() }));
  return links;
};

const results = [];

// Charizard ex SPC 2024 — try promo + obsidian flames + scarlet violet base
const czLinks = [
  ...findInConsole('pokemon-promo', /charizard.*super.premium|super.premium.*charizard/i),
  ...findInConsole('pokemon-obsidian-flames', /charizard.*premium|super.premium/i),
  ...findInConsole('pokemon-scarlet-and-violet-base-set', /charizard.*premium|super.premium/i),
];
console.log('Charizard ex SPC candidates:', czLinks.map(l => l.name + ' | ' + l.href).join('\n'));
for (const { href, name } of czLinks.slice(0,3)) {
  const p = extractPrice(get(href));
  if (p) { console.log(`  → $${p} | ${name}`); results.push({ label: 'Charizard ex SPC', msrp: 119.99, market: p, multNow: +(p/119.99).toFixed(2), histFrom: '2024-11', prodName: name }); break; }
}

// SS Charizard UPC 2022
const charLinks = [
  ...findInConsole('pokemon-promo', /charizard.*ultra.premium|ultra.premium.*charizard/i),
  ...findInConsole('pokemon-silver-tempest', /ultra.premium/i),
  ...findInConsole('pokemon-celebrations', /charizard.*ultra.premium|ultra.premium.*charizard/i),
];
console.log('\nSS Charizard UPC candidates:', charLinks.map(l => l.name + ' | ' + l.href).join('\n'));
for (const { href, name } of charLinks.slice(0,3)) {
  const p = extractPrice(get(href));
  if (p) { console.log(`  → $${p} | ${name}`); results.push({ label: 'Sword Shield Charizard UPC', msrp: 99.99, market: p, multNow: +(p/99.99).toFixed(2), histFrom: '2022-10', prodName: name }); break; }
}

// Zacian Zamazenta UPC 2020
const zzLinks = [
  ...findInConsole('pokemon-promo', /zacian|zamazenta|ultra.premium/i),
  ...findInConsole('pokemon-vivid-voltage', /ultra.premium/i),
  ...findInConsole('pokemon-rebel-clash', /ultra.premium/i),
];
console.log('\nZacian/Zamazenta UPC candidates:', zzLinks.map(l => l.name + ' | ' + l.href).join('\n'));
for (const { href, name } of zzLinks.slice(0,3)) {
  const p = extractPrice(get(href));
  if (p) { console.log(`  → $${p} | ${name}`); results.push({ label: 'Sword Shield Zacian UPC', msrp: 99.99, market: p, multNow: +(p/99.99).toFixed(2), histFrom: '2020-08', prodName: name }); break; }
}

// Terapagos ex UPC 2024
const tLinks = [
  ...findInConsole('pokemon-stellar-crown', /ultra.premium|terapagos/i),
  ...findInConsole('pokemon-promo', /terapagos.*ultra.premium|ultra.premium.*terapagos/i),
];
console.log('\nTerapagos UPC candidates:', tLinks.map(l => l.name + ' | ' + l.href).join('\n'));
for (const { href, name } of tLinks.slice(0,3)) {
  const p = extractPrice(get(href));
  if (p) { console.log(`  → $${p} | ${name}`); results.push({ label: 'Terapagos ex UPC', msrp: 119.99, market: p, multNow: +(p/119.99).toFixed(2), histFrom: '2024-11', prodName: name }); break; }
}

// Mega Charizard X ex UPC 2025
const mcLinks = [
  ...findInConsole('pokemon-promo', /mega.charizard.*ultra.premium|ultra.premium.*mega.charizard/i),
  ...findInConsole('pokemon-destined-rivals', /ultra.premium/i),
];
console.log('\nMega Charizard X UPC candidates:', mcLinks.map(l => l.name + ' | ' + l.href).join('\n'));
for (const { href, name } of mcLinks.slice(0,3)) {
  const p = extractPrice(get(href));
  if (p) { console.log(`  → $${p} | ${name}`); results.push({ label: 'Mega Charizard X ex UPC', msrp: 129.99, market: p, multNow: +(p/129.99).toFixed(2), histFrom: '2025-03', prodName: name }); break; }
}

// 30th Celebration UPC (2026)
const thirtyLinks = [
  ...findInConsole('pokemon-promo', /30th|ultra.premium.*30|thirty/i),
  ...findInConsole('pokemon-destined-rivals', /ultra.premium/i),
];
console.log('\n30th UPC candidates:', thirtyLinks.map(l => l.name + ' | ' + l.href).join('\n'));
for (const { href, name } of thirtyLinks.slice(0,3)) {
  const p = extractPrice(get(href));
  if (p) { console.log(`  → $${p} | ${name}`); results.push({ label: '30th Celebration UPC', msrp: 149.99, market: p, multNow: +(p/149.99).toFixed(2), histFrom: '2026-07', prodName: name }); break; }
}

// Append found products
if (results.length) {
  const existing = readFileSync(csvPath, 'utf8').trimEnd();
  const existingLines = existing.split('\n');
  const newRows = results
    .filter(r => !existingLines.some(l => l.startsWith(`${r.label},`)))
    .map(r => `${r.label},${r.prodName} (SPC/UPC),${r.msrp},${r.market},${r.market},${r.multNow},${r.multNow},${r.histFrom},spc,Y`);
  if (newRows.length) {
    writeFileSync(csvPath, existing + '\n' + newRows.join('\n') + '\n');
    console.log(`\nAppended ${newRows.length} rows`);
  }
}

// Print final CSV state
console.log('\n=== FINAL SPC/UPC CSV ROWS ===');
readFileSync(csvPath,'utf8').split('\n').filter(l => l.includes(',spc,')).forEach(l => {
  const p = l.split(','); console.log(`${p[7]} ${p[0]}: $${p[3]} (${p[5]}×)`);
});
