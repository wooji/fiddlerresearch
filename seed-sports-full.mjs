// Full sports DB seed: Football/Baseball/Basketball 2010–2025
import { readFileSync, writeFileSync } from 'fs';

const db = JSON.parse(readFileSync('set-history-sports.json', 'utf8'));
if (!db.sets) db.sets = {};

const YRS = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ALL = YRS(2010, 2025);
const Y13  = YRS(2013, 2025);
const Y14  = YRS(2014, 2025);
const Y15  = YRS(2015, 2025);
const Y16  = YRS(2016, 2025);
const Y17  = YRS(2017, 2025);
const Y19  = YRS(2019, 2025);
const Y20  = YRS(2020, 2025);
const Y22  = YRS(2022, 2025);

function mk(name, sport, brand, tier, year) {
  return { name, sport, brand, tier, year, category: 'sports', retail: null, market: null, ath: null };
}

// ── FOOTBALL ─────────────────────────────────────────────────────────────────
const FOOTBALL = [
  ...ALL.map(y => mk(`${y} Panini Prizm Football`,                  'football', 'panini', 'prizm', y)),
  ...ALL.map(y => mk(`${y} Panini National Treasures Football`,     'football', 'panini', 'national-treasures', y)),
  ...ALL.map(y => mk(`${y} Panini Immaculate Football`,             'football', 'panini', 'immaculate', y)),
  ...ALL.map(y => mk(`${y} Panini Select Football`,                 'football', 'panini', 'select', y)),
  ...Y19.map(y  => mk(`${y} Panini Mosaic Football`,                'football', 'panini', 'mosaic', y)),
  ...ALL.map(y => mk(`${y} Panini Donruss Optic Football`,          'football', 'panini', 'optic', y)),
  ...ALL.map(y => mk(`${y} Panini Contenders Football`,             'football', 'panini', 'contenders', y)),
  ...ALL.map(y => mk(`${y} Panini Score Football`,                  'football', 'panini', 'score', y)),
  ...ALL.map(y => mk(`${y} Panini Prestige Football`,               'football', 'panini', 'prestige', y)),
  ...ALL.map(y => mk(`${y} Panini Absolute Football`,               'football', 'panini', 'absolute', y)),
  ...ALL.map(y => mk(`${y} Panini Certified Football`,              'football', 'panini', 'certified', y)),
  ...ALL.map(y => mk(`${y} Panini Spectra Football`,                'football', 'panini', 'spectra', y)),
  ...ALL.map(y => mk(`${y} Panini Flawless Football`,               'football', 'panini', 'flawless', y)),
  ...ALL.map(y => mk(`${y} Panini Gold Standard Football`,          'football', 'panini', 'gold-standard', y)),
  ...ALL.map(y => mk(`${y} Panini Origins Football`,                'football', 'panini', 'origins', y)),
  ...Y19.map(y  => mk(`${y} Panini Obsidian Football`,              'football', 'panini', 'obsidian', y)),
  ...ALL.map(y => mk(`${y} Panini Phoenix Football`,                'football', 'panini', 'phoenix', y)),
  ...ALL.map(y => mk(`${y} Panini Revolution Football`,             'football', 'panini', 'revolution', y)),
  ...ALL.map(y => mk(`${y} Panini Illusions Football`,              'football', 'panini', 'illusions', y)),
  ...Y19.map(y  => mk(`${y} Panini Chronicles Football`,            'football', 'panini', 'chronicles', y)),
  ...ALL.map(y => mk(`${y} Panini Playbook Football`,               'football', 'panini', 'playbook', y)),
  ...ALL.map(y => mk(`${y} Panini Rookies and Stars Football`,      'football', 'panini', 'rookies-and-stars', y)),
  ...ALL.map(y => mk(`${y} Panini Playoff Football`,                'football', 'panini', 'playoff', y)),
  ...ALL.map(y => mk(`${y} Panini Donruss Football`,                'football', 'panini', 'donruss', y)),
  ...ALL.map(y => mk(`${y} Panini Encased Football`,                'football', 'panini', 'encased', y)),
  ...ALL.map(y => mk(`${y} Panini Five Star Football`,              'football', 'panini', 'five-star', y)),
  ...ALL.map(y => mk(`${y} Panini Luminance Football`,              'football', 'panini', 'luminance', y)),
  ...Y19.map(y  => mk(`${y} Panini Black Football`,                 'football', 'panini', 'black', y)),
  ...Y22.map(y  => mk(`${y} Panini Titanium Football`,              'football', 'panini', 'titanium', y)),
  ...ALL.map(y => mk(`${y} Panini Cornerstones Football`,           'football', 'panini', 'cornerstones', y)),
  ...ALL.map(y => mk(`${y} Panini Flux Football`,                   'football', 'panini', 'flux', y)),
  ...ALL.map(y => mk(`${y} Panini Unparalleled Football`,           'football', 'panini', 'unparalleled', y)),
  ...ALL.map(y => mk(`${y} Panini Elements Football`,               'football', 'panini', 'elements', y)),
  ...ALL.map(y => mk(`${y} Panini Status Football`,                 'football', 'panini', 'status', y)),
  ...ALL.map(y => mk(`${y} Panini Gridiron Kings Football`,         'football', 'panini', 'gridiron-kings', y)),
  ...ALL.map(y => mk(`${y} Panini Zenith Football`,                 'football', 'panini', 'zenith', y)),
  ...ALL.map(y => mk(`${y} Contenders Draft Picks Football`,        'football', 'panini', 'contenders-draft', y)),
  ...ALL.map(y => mk(`${y} Bowman University Football`,             'football', 'bowman', 'bowman-university', y)),
  ...Y14.map(y  => mk(`${y} Leaf Draft Football`,                   'football', 'leaf', 'leaf-draft', y)),
  ...Y14.map(y  => mk(`${y} Leaf Metal Football`,                   'football', 'leaf', 'leaf-metal', y)),
  ...Y14.map(y  => mk(`${y} SAGE Hit Football`,                     'football', 'sage', 'sage-hit', y)),
];

// ── BASEBALL ──────────────────────────────────────────────────────────────────
const BASEBALL = [
  ...ALL.map(y => mk(`${y} Topps Chrome Baseball`,                  'baseball', 'topps', 'chrome', y)),
  ...ALL.map(y => mk(`${y} Topps Series 1 Baseball`,                'baseball', 'topps', 'series-1', y)),
  ...ALL.map(y => mk(`${y} Topps Series 2 Baseball`,                'baseball', 'topps', 'series-2', y)),
  ...ALL.map(y => mk(`${y} Topps Update Series Baseball`,           'baseball', 'topps', 'update', y)),
  ...ALL.map(y => mk(`${y} Bowman Chrome Baseball`,                 'baseball', 'bowman', 'chrome', y)),
  ...ALL.map(y => mk(`${y} Bowman Draft Baseball`,                  'baseball', 'bowman', 'draft', y)),
  ...ALL.map(y => mk(`${y} Bowman Sterling Baseball`,               'baseball', 'bowman', 'sterling', y)),
  ...ALL.map(y => mk(`${y} Bowman Platinum Baseball`,               'baseball', 'bowman', 'platinum', y)),
  ...Y13.map(y  => mk(`${y} Topps Tier One Baseball`,               'baseball', 'topps', 'tier-one', y)),
  ...ALL.map(y => mk(`${y} Topps Heritage Baseball`,                'baseball', 'topps', 'heritage', y)),
  ...ALL.map(y => mk(`${y} Topps Stadium Club Baseball`,            'baseball', 'topps', 'stadium-club', y)),
  ...ALL.map(y => mk(`${y} Topps Finest Baseball`,                  'baseball', 'topps', 'finest', y)),
  ...ALL.map(y => mk(`${y} Topps Allen and Ginter Baseball`,        'baseball', 'topps', 'allen-ginter', y)),
  ...ALL.map(y => mk(`${y} Topps Gold Label Baseball`,              'baseball', 'topps', 'gold-label', y)),
  ...Y14.map(y  => mk(`${y} Topps Five Star Baseball`,              'baseball', 'topps', 'five-star', y)),
  ...ALL.map(y => mk(`${y} Topps Gypsy Queen Baseball`,             'baseball', 'topps', 'gypsy-queen', y)),
  ...Y14.map(y  => mk(`${y} Topps Gallery Baseball`,                'baseball', 'topps', 'gallery', y)),
  ...ALL.map(y => mk(`${y} Topps Archives Baseball`,                'baseball', 'topps', 'archives', y)),
  ...Y17.map(y  => mk(`${y} Topps Big League Baseball`,             'baseball', 'topps', 'big-league', y)),
  ...Y13.map(y  => mk(`${y} Topps Tribute Baseball`,                'baseball', 'topps', 'tribute', y)),
  ...Y13.map(y  => mk(`${y} Topps Dynasty Baseball`,                'baseball', 'topps', 'dynasty', y)),
  ...ALL.map(y => mk(`${y} Panini National Treasures Baseball`,     'baseball', 'panini', 'national-treasures', y)),
  ...ALL.map(y => mk(`${y} Panini Immaculate Baseball`,             'baseball', 'panini', 'immaculate', y)),
  ...Y16.map(y  => mk(`${y} Panini Prizm Baseball`,                 'baseball', 'panini', 'prizm', y)),
  ...ALL.map(y => mk(`${y} Panini Diamond Kings Baseball`,          'baseball', 'panini', 'diamond-kings', y)),
  ...ALL.map(y => mk(`${y} Panini Donruss Baseball`,                'baseball', 'panini', 'donruss', y)),
  ...Y14.map(y  => mk(`${y} Leaf Metal Baseball`,                   'baseball', 'leaf', 'leaf-metal', y)),
];

// ── BASKETBALL ────────────────────────────────────────────────────────────────
const BASKETBALL = [
  ...ALL.map(y => mk(`${y} Panini Prizm Basketball`,                'basketball', 'panini', 'prizm', y)),
  ...ALL.map(y => mk(`${y} Panini National Treasures Basketball`,   'basketball', 'panini', 'national-treasures', y)),
  ...ALL.map(y => mk(`${y} Panini Immaculate Basketball`,           'basketball', 'panini', 'immaculate', y)),
  ...Y13.map(y  => mk(`${y} Panini Select Basketball`,              'basketball', 'panini', 'select', y)),
  ...Y19.map(y  => mk(`${y} Panini Mosaic Basketball`,              'basketball', 'panini', 'mosaic', y)),
  ...ALL.map(y => mk(`${y} Panini Donruss Optic Basketball`,        'basketball', 'panini', 'optic', y)),
  ...ALL.map(y => mk(`${y} Panini Contenders Basketball`,           'basketball', 'panini', 'contenders', y)),
  ...ALL.map(y => mk(`${y} Panini Hoops Basketball`,                'basketball', 'panini', 'hoops', y)),
  ...Y14.map(y  => mk(`${y} Panini Flawless Basketball`,            'basketball', 'panini', 'flawless', y)),
  ...ALL.map(y => mk(`${y} Panini Gold Standard Basketball`,        'basketball', 'panini', 'gold-standard', y)),
  ...Y13.map(y  => mk(`${y} Panini Spectra Basketball`,             'basketball', 'panini', 'spectra', y)),
  ...Y14.map(y  => mk(`${y} Panini Origins Basketball`,             'basketball', 'panini', 'origins', y)),
  ...Y19.map(y  => mk(`${y} Panini Obsidian Basketball`,            'basketball', 'panini', 'obsidian', y)),
  ...ALL.map(y => mk(`${y} Panini Status Basketball`,               'basketball', 'panini', 'status', y)),
  ...Y14.map(y  => mk(`${y} Panini Revolution Basketball`,          'basketball', 'panini', 'revolution', y)),
  ...ALL.map(y => mk(`${y} Panini Illusions Basketball`,            'basketball', 'panini', 'illusions', y)),
  ...Y19.map(y  => mk(`${y} Panini Chronicles Basketball`,          'basketball', 'panini', 'chronicles', y)),
  ...ALL.map(y => mk(`${y} Panini Absolute Basketball`,             'basketball', 'panini', 'absolute', y)),
  ...ALL.map(y => mk(`${y} Panini Certified Basketball`,            'basketball', 'panini', 'certified', y)),
  ...Y14.map(y  => mk(`${y} Panini Phoenix Basketball`,             'basketball', 'panini', 'phoenix', y)),
  ...Y14.map(y  => mk(`${y} Panini Encased Basketball`,             'basketball', 'panini', 'encased', y)),
  ...Y14.map(y  => mk(`${y} Panini Playbook Basketball`,            'basketball', 'panini', 'playbook', y)),
  ...Y19.map(y  => mk(`${y} Panini Black Basketball`,               'basketball', 'panini', 'black', y)),
  ...Y22.map(y  => mk(`${y} Panini Titanium Basketball`,            'basketball', 'panini', 'titanium', y)),
  ...Y14.map(y  => mk(`${y} Panini Cornerstones Basketball`,        'basketball', 'panini', 'cornerstones', y)),
  ...Y14.map(y  => mk(`${y} Panini Flux Basketball`,                'basketball', 'panini', 'flux', y)),
  ...Y14.map(y  => mk(`${y} Panini Unparalleled Basketball`,        'basketball', 'panini', 'unparalleled', y)),
  ...ALL.map(y => mk(`${y} Panini Donruss Basketball`,              'basketball', 'panini', 'donruss', y)),
  ...Y14.map(y  => mk(`${y} Panini Five Star Basketball`,           'basketball', 'panini', 'five-star', y)),
];

// ── SEED ──────────────────────────────────────────────────────────────────────
let addedF = 0, addedB = 0, addedBB = 0;

for (const s of FOOTBALL) {
  const key = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  if (!db.sets[key]) { db.sets[key] = { ...s, key }; addedF++; }
  else if (!db.sets[key].sport) { db.sets[key].sport = 'football'; db.sets[key].brand = s.brand; db.sets[key].tier = s.tier; }
}
for (const s of BASEBALL) {
  const key = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  if (!db.sets[key]) { db.sets[key] = { ...s, key }; addedB++; }
  else if (!db.sets[key].sport) { db.sets[key].sport = 'baseball'; db.sets[key].brand = s.brand; db.sets[key].tier = s.tier; }
}
for (const s of BASKETBALL) {
  const key = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  if (!db.sets[key]) { db.sets[key] = { ...s, key }; addedBB++; }
  else if (!db.sets[key].sport) { db.sets[key].sport = 'basketball'; db.sets[key].brand = s.brand; db.sets[key].tier = s.tier; }
}

writeFileSync('set-history-sports.json', JSON.stringify(db, null, 2) + '\n');
console.log(`Football added: ${addedF}  Baseball added: ${addedB}  Basketball added: ${addedBB}  Total: ${Object.keys(db.sets).length}`);
