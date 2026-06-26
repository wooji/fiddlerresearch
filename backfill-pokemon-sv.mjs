import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ebaySold } from './lib/deep-research.mjs';
import { stockxMarket } from './lib/stockx.mjs';

const ROOT = 'C:/Users/Christopher/CodexProjects/jester-researcher';
const DB_PATH = join(ROOT, 'set-history.json');
const TODAY = new Date('2026-06-23');

function monthsAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Math.round(((TODAY - d) / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10;
}

// Key SV-era sets to backfill with targeted eBay queries
const SV_SETS = [
  { key: 'pokemon-prismatic-evolutions', query: 'Pokemon Prismatic Evolutions booster box sealed', retail: 143.64, releaseDate: '2025-01-17' },
  { key: 'pokemon-paldean-fates', query: 'Pokemon Paldean Fates booster box sealed', retail: 143.64, releaseDate: '2024-01-26' },
  { key: 'pokemon-scarlet-&-violet-151', query: 'Pokemon Scarlet Violet 151 booster box sealed', retail: 143.64, releaseDate: '2023-09-22' },
  { key: 'pokemon-stellar-crown', query: 'Pokemon Stellar Crown booster box sealed', retail: 143.64, releaseDate: '2024-09-13' },
  { key: 'pokemon-ascended-heroes', query: 'Pokemon Ascended Heroes booster box sealed', retail: 143.64, releaseDate: '2026-01-24' },
  { key: 'pokemon-perfect-order', query: 'Pokemon Perfect Order booster box sealed', retail: 143.64, releaseDate: '2026-03-28' },
  { key: 'pokemon-scarlet-&-violet', query: 'Pokemon Scarlet Violet base booster box sealed SV01', retail: 107.97, releaseDate: '2023-04-01' },
  { key: 'pokemon-obsidian-flames', query: 'Pokemon Obsidian Flames booster box sealed', retail: 107.97, releaseDate: '2023-08-11' },
  { key: 'pokemon-paradox-rift', query: 'Pokemon Paradox Rift booster box sealed', retail: 107.97, releaseDate: '2023-11-03' },
  { key: 'pokemon-twilight-masquerade', query: 'Pokemon Twilight Masquerade booster box sealed', retail: 107.97, releaseDate: '2024-05-24' },
  { key: 'pokemon-shrouded-fable', query: 'Pokemon Shrouded Fable booster box sealed', retail: 143.64, releaseDate: '2024-08-02' },
  { key: 'pokemon-surging-sparks', query: 'Pokemon Surging Sparks booster box sealed', retail: 143.64, releaseDate: '2024-11-08' },
  { key: 'pokemon-journey-together', query: 'Pokemon Journey Together booster box sealed', retail: 143.64, releaseDate: '2025-03-28' },
  { key: 'pokemon-destined-rivals', query: 'Pokemon Destined Rivals booster box sealed', retail: 143.64, releaseDate: '2025-05-30' },
  { key: 'pokemon-chaos-rising', query: 'Pokemon Chaos Rising booster box sealed', retail: 143.64, releaseDate: '2025-08-01' },
];

async function log(msg) { process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${msg}\n`); }

async function main() {
  const db = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  let updated = 0;

  for (const s of SV_SETS) {
    try {
      log(`Fetching ${s.key}...`);
      const ebay = await ebaySold(s.query, { retailFloor: s.retail });
      const stockx = await stockxMarket(s.key.replace('pokemon-', 'Pokemon ').replace(/-/g, ' ') + ' booster box').catch(() => null);

      const current = ebay?.median30 ?? ebay?.median ?? stockx?.last ?? null;
      const ath = Math.max(ebay?.high ?? 0, stockx?.ask ?? 0, db.sets[s.key]?.products?.['booster-box']?.ath ?? 0) || null;
      const months = monthsAgo(s.releaseDate);

      if (!db.sets[s.key]) {
        db.sets[s.key] = { name: s.key.replace('pokemon-', '').replace(/-/g, ' '), firstMonth: s.releaseDate?.slice(0,7), products: {} };
      }
      if (!db.sets[s.key].products['booster-box']) db.sets[s.key].products['booster-box'] = {};
      const box = db.sets[s.key].products['booster-box'];
      if (current) box.current = Math.round(current * 100) / 100;
      if (ath) box.ath = Math.round(ath * 100) / 100;
      if (months) box.months = months;
      if (s.retail && !box.first) box.first = s.retail;
      updated++;
      log(`  ${s.key}: current=$${current ?? 'n/a'} ath=$${ath ?? 'n/a'}`);
    } catch(e) {
      log(`  Error ${s.key}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  writeFileSync(DB_PATH, JSON.stringify(db, null, 1), 'utf8');
  log(`Done. Updated ${updated} Pokemon sets.`);
}

main().catch(console.error);
