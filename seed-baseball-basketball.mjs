import { readFileSync, writeFileSync } from 'fs';

const db = JSON.parse(readFileSync('set-history-sports.json', 'utf8'));
if (!db.sets) db.sets = {};

const Y17_24 = [2017,2018,2019,2020,2021,2022,2023,2024];
const Y17_23 = [2017,2018,2019,2020,2021,2022,2023];
const Y19_24 = [2019,2020,2021,2022,2023,2024];

function mkSet(name, sport, brand, tier, year) {
  return { name, sport, brand, tier, year, category: 'sports', retail: null, market: null, ath: null };
}

const BASEBALL = [
  ...Y17_24.map(y => mkSet(`${y} Topps Chrome Baseball`, 'baseball', 'topps', 'chrome', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Series 1 Baseball`, 'baseball', 'topps', 'series-1', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Series 2 Baseball`, 'baseball', 'topps', 'series-2', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Update Series Baseball`, 'baseball', 'topps', 'update', y)),
  ...Y17_24.map(y => mkSet(`${y} Bowman Chrome Baseball`, 'baseball', 'bowman', 'chrome', y)),
  ...Y17_24.map(y => mkSet(`${y} Bowman Draft Baseball`, 'baseball', 'bowman', 'draft', y)),
  ...Y17_24.map(y => mkSet(`${y} Bowman Sterling Baseball`, 'baseball', 'bowman', 'sterling', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Tier One Baseball`, 'baseball', 'topps', 'tier-one', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Heritage Baseball`, 'baseball', 'topps', 'heritage', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Stadium Club Baseball`, 'baseball', 'topps', 'stadium-club', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Finest Baseball`, 'baseball', 'topps', 'finest', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Allen and Ginter Baseball`, 'baseball', 'topps', 'allen-ginter', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Gold Label Baseball`, 'baseball', 'topps', 'gold-label', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Five Star Baseball`, 'baseball', 'topps', 'five-star', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Gypsy Queen Baseball`, 'baseball', 'topps', 'gypsy-queen', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Gallery Baseball`, 'baseball', 'topps', 'gallery', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Archives Baseball`, 'baseball', 'topps', 'archives', y)),
  ...Y17_24.map(y => mkSet(`${y} Topps Big League Baseball`, 'baseball', 'topps', 'big-league', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini National Treasures Baseball`, 'baseball', 'panini', 'national-treasures', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Immaculate Baseball`, 'baseball', 'panini', 'immaculate', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Prizm Baseball`, 'baseball', 'panini', 'prizm', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Diamond Kings Baseball`, 'baseball', 'panini', 'diamond-kings', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Donruss Baseball`, 'baseball', 'panini', 'donruss', y)),
  ...Y17_24.map(y => mkSet(`${y} Leaf Metal Baseball`, 'baseball', 'leaf', 'leaf-metal', y)),
];

const BASKETBALL = [
  ...Y17_23.map(y => mkSet(`${y} Panini Prizm Basketball`, 'basketball', 'panini', 'prizm', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini National Treasures Basketball`, 'basketball', 'panini', 'national-treasures', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Immaculate Basketball`, 'basketball', 'panini', 'immaculate', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Select Basketball`, 'basketball', 'panini', 'select', y)),
  ...Y19_24.map(y => mkSet(`${y} Panini Mosaic Basketball`, 'basketball', 'panini', 'mosaic', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Donruss Optic Basketball`, 'basketball', 'panini', 'optic', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Contenders Basketball`, 'basketball', 'panini', 'contenders', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Hoops Basketball`, 'basketball', 'panini', 'hoops', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Flawless Basketball`, 'basketball', 'panini', 'flawless', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Gold Standard Basketball`, 'basketball', 'panini', 'gold-standard', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Spectra Basketball`, 'basketball', 'panini', 'spectra', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Origins Basketball`, 'basketball', 'panini', 'origins', y)),
  ...Y19_24.map(y => mkSet(`${y} Panini Obsidian Basketball`, 'basketball', 'panini', 'obsidian', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Status Basketball`, 'basketball', 'panini', 'status', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Revolution Basketball`, 'basketball', 'panini', 'revolution', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Illusions Basketball`, 'basketball', 'panini', 'illusions', y)),
  ...Y19_24.map(y => mkSet(`${y} Panini Chronicles Basketball`, 'basketball', 'panini', 'chronicles', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Absolute Basketball`, 'basketball', 'panini', 'absolute', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Certified Basketball`, 'basketball', 'panini', 'certified', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Phoenix Basketball`, 'basketball', 'panini', 'phoenix', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Encased Basketball`, 'basketball', 'panini', 'encased', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Playbook Basketball`, 'basketball', 'panini', 'playbook', y)),
  ...Y19_24.map(y => mkSet(`${y} Panini Black Basketball`, 'basketball', 'panini', 'black', y)),
  ...[2022,2023,2024].map(y => mkSet(`${y} Panini Titanium Basketball`, 'basketball', 'panini', 'titanium', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Cornerstones Basketball`, 'basketball', 'panini', 'cornerstones', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Flux Basketball`, 'basketball', 'panini', 'flux', y)),
  ...Y17_24.map(y => mkSet(`${y} Panini Unparalleled Basketball`, 'basketball', 'panini', 'unparalleled', y)),
];

let addedB = 0, addedBB = 0;
for (const s of BASEBALL) {
  const key = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  if (!db.sets[key]) { db.sets[key] = { ...s, key }; addedB++; }
}
for (const s of BASKETBALL) {
  const key = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  if (!db.sets[key]) { db.sets[key] = { ...s, key }; addedBB++; }
}

writeFileSync('set-history-sports.json', JSON.stringify(db, null, 2) + '\n');
console.log(`Baseball added: ${addedB}  Basketball added: ${addedBB}  Total sets: ${Object.keys(db.sets).length}`);
