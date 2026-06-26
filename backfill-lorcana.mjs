import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ebaySold } from './lib/deep-research.mjs';

const ROOT = 'C:/Users/Christopher/CodexProjects/jester-researcher';
const DB_PATH = join(ROOT, 'set-history-lorcana.json');
const TODAY = new Date('2026-06-23');
function monthsAgo(dateStr) {
  if (!dateStr) return null;
  return Math.round(((TODAY - new Date(dateStr)) / (1000*60*60*24*30.44)) * 10) / 10;
}

const LORCANA_SETS = [
  { key: 'lorcana-first-chapter', name: 'The First Chapter', query: 'Disney Lorcana First Chapter booster box sealed', retail: 120, releaseDate: '2023-08-18' },
  { key: 'lorcana-rise-of-the-floodborn', name: 'Rise of the Floodborn', query: 'Disney Lorcana Rise Floodborn booster box sealed', retail: 120, releaseDate: '2023-11-17' },
  { key: 'lorcana-into-the-inklands', name: 'Into the Inklands', query: 'Disney Lorcana Into Inklands booster box sealed', retail: 120, releaseDate: '2024-02-23' },
  { key: 'lorcana-ursulas-return', name: "Ursula's Return", query: "Disney Lorcana Ursula Return booster box sealed", retail: 120, releaseDate: '2024-05-17' },
  { key: 'lorcana-shimmering-skies', name: 'Shimmering Skies', query: 'Disney Lorcana Shimmering Skies booster box sealed', retail: 120, releaseDate: '2024-08-09' },
  { key: 'lorcana-azurite-sea', name: 'Azurite Sea', query: 'Disney Lorcana Azurite Sea booster box sealed', retail: 120, releaseDate: '2024-11-08' },
  { key: 'lorcana-archazias-island', name: "Archazia's Island", query: "Disney Lorcana Archazia Island booster box sealed", retail: 120, releaseDate: '2025-02-28' },
  { key: 'lorcana-fabled', name: 'Fabled', query: 'Disney Lorcana Fabled booster box sealed', retail: 120, releaseDate: '2025-05-16' },
  { key: 'lorcana-winterspell', name: 'Winterspell', query: 'Disney Lorcana Winterspell booster box sealed', retail: 120, releaseDate: '2025-08-15' },
  { key: 'lorcana-wilds-unknown', name: 'Wilds of the Unknown', query: 'Disney Lorcana Wilds Unknown booster box sealed', retail: 120, releaseDate: '2025-11-14' },
];

async function log(msg) { process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${msg}\n`); }

async function main() {
  const db = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  const sets = db.sets ?? {};
  let updated = 0;

  for (const s of LORCANA_SETS) {
    try {
      log(`Fetching ${s.key}...`);
      const ebay = await ebaySold(s.query, { retailFloor: s.retail * 0.7 });
      const current = ebay?.median30 ?? ebay?.median ?? null;
      const ath = Math.max(ebay?.high ?? 0, sets[s.key]?.products?.['booster-box']?.ath ?? 0) || null;
      const months = monthsAgo(s.releaseDate);

      if (!sets[s.key]) sets[s.key] = { name: s.name, releaseDate: s.releaseDate, retail: s.retail, retailVerified: true, products: {} };
      if (!sets[s.key].products['booster-box']) sets[s.key].products['booster-box'] = {};
      const box = sets[s.key].products['booster-box'];
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

  db.sets = sets;
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  log(`Done. Updated ${updated} Lorcana sets.`);
}

main().catch(console.error);
