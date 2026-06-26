import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ebaySold } from './lib/deep-research.mjs';
import { stockxMarket } from './lib/stockx.mjs';

const ROOT = 'C:/Users/Christopher/CodexProjects/jester-researcher';
const DB_PATH = join(ROOT, 'set-history-mtg.json');
const TODAY = new Date('2026-06-23');
function monthsAgo(dateStr) {
  if (!dateStr) return null;
  return Math.round(((TODAY - new Date(dateStr)) / (1000*60*60*24*30.44)) * 10) / 10;
}

const MTG_SETS = [
  { key: 'magic-lord-of-the-rings', name: 'LOTR Tales of Middle Earth', query: 'Magic Lord of the Rings Tales Middle Earth collector booster box sealed', retail: 324, releaseDate: '2023-06-23' },
  { key: 'magic-final-fantasy', name: 'Final Fantasy', query: 'Magic the Gathering Final Fantasy collector booster box sealed', retail: 324, releaseDate: '2025-06-13' },
  { key: 'magic-bloomburrow', name: 'Bloomburrow', query: 'Magic Bloomburrow collector booster box sealed MTG', retail: 324, releaseDate: '2024-08-02' },
  { key: 'magic-duskmourn', name: 'Duskmourn House of Horror', query: 'Magic Duskmourn House Horror collector booster box sealed', retail: 324, releaseDate: '2024-09-27' },
  { key: 'magic-modern-horizons-3', name: 'Modern Horizons 3', query: 'Magic Modern Horizons 3 collector booster box sealed', retail: 360, releaseDate: '2024-06-14' },
  { key: 'magic-outlaws-at-thunder-junction', name: 'Outlaws at Thunder Junction', query: 'Magic Outlaws Thunder Junction collector booster box sealed', retail: 324, releaseDate: '2024-04-19' },
  { key: 'magic-murders-at-karlov-manor', name: 'Murders at Karlov Manor', query: 'Magic Murders Karlov Manor collector booster box sealed', retail: 324, releaseDate: '2024-02-09' },
  { key: 'magic-lost-caverns-ixalan', name: 'Lost Caverns of Ixalan', query: 'Magic Lost Caverns Ixalan collector booster box sealed', retail: 324, releaseDate: '2023-11-17' },
  { key: 'magic-wilds-of-eldraine', name: 'Wilds of Eldraine', query: 'Magic Wilds Eldraine collector booster box sealed', retail: 324, releaseDate: '2023-09-08' },
  { key: 'magic-marvel-super-heroes', name: 'Marvel Super Heroes', query: 'Magic Marvel Super Heroes collector booster box sealed MTG', retail: 450, releaseDate: '2025-10-17' },
  { key: 'magic-foundations', name: 'Foundations', query: 'Magic Foundations collector booster box sealed MTG', retail: 324, releaseDate: '2024-11-15' },
  { key: 'magic-aetherdrift', name: 'Aetherdrift', query: 'Magic Aetherdrift collector booster box sealed MTG', retail: 324, releaseDate: '2025-02-14' },
  { key: 'magic-tarkir-dragonstorm', name: 'Tarkir Dragonstorm', query: 'Magic Tarkir Dragonstorm collector booster box sealed', retail: 324, releaseDate: '2025-04-25' },
  { key: 'magic-avatar-the-last-airbender', name: 'Avatar the Last Airbender', query: 'Magic Avatar Last Airbender collector booster box sealed', retail: 324, releaseDate: '2025-07-25' },
  { key: 'magic-teenage-mutant-ninja-turtles', name: 'Teenage Mutant Ninja Turtles', query: 'Magic TMNT Ninja Turtles collector booster box sealed MTG', retail: 324, releaseDate: '2025-08-29' },
  { key: 'magic-the-hobbit', name: 'The Hobbit', query: 'Magic the Gathering Hobbit collector booster box sealed 2026', retail: 324, releaseDate: '2026-07-25' },
  { key: 'magic-spider-man', name: 'Spider-Man', query: 'Magic Spider Man Into Spider Verse collector booster box sealed', retail: 450, releaseDate: '2025-06-27' },
];

async function log(msg) { process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${msg}\n`); }

async function main() {
  const db = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  const sets = db.sets ?? db;
  let updated = 0;

  for (const s of MTG_SETS) {
    try {
      log(`Fetching ${s.key}...`);
      const ebay = await ebaySold(s.query, { retailFloor: s.retail * 0.5 });
      const current = ebay?.median30 ?? ebay?.median ?? null;
      const ath = Math.max(ebay?.high ?? 0, sets[s.key]?.products?.['collector-booster-box']?.ath ?? 0) || null;
      const months = monthsAgo(s.releaseDate);

      if (!sets[s.key]) sets[s.key] = { name: s.name, releaseDate: s.releaseDate, retail: s.retail, retailVerified: true, products: {} };
      if (!sets[s.key].products) sets[s.key].products = {};
      if (!sets[s.key].products['collector-booster-box']) sets[s.key].products['collector-booster-box'] = {};
      const box = sets[s.key].products['collector-booster-box'];
      if (current) box.current = Math.round(current * 100) / 100;
      if (ath) box.ath = Math.round(ath * 100) / 100;
      if (months) box.months = months;
      updated++;
      log(`  ${s.key}: current=$${current ?? 'n/a'} ath=$${ath ?? 'n/a'}`);
    } catch(e) {
      log(`  Error ${s.key}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (db.sets) db.sets = sets; else Object.assign(db, sets);
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  log(`Done. Updated ${updated} MTG sets.`);
}

main().catch(console.error);
