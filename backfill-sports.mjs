import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ebaySold } from './lib/deep-research.mjs';
import { stockxMarket } from './lib/stockx.mjs';

const ROOT = 'C:/Users/Christopher/CodexProjects/jester-researcher';
const DB_PATH = join(ROOT, 'set-history-sports.json');
const TODAY = new Date('2026-06-23');
function monthsAgo(dateStr) {
  if (!dateStr) return null;
  return Math.round(((TODAY - new Date(dateStr)) / (1000*60*60*24*30.44)) * 10) / 10;
}

const SPORTS_SETS = [
  { key: '2026-topps-chrome-baseball', name: '2026 Topps Chrome Baseball', query: '2026 Topps Chrome Baseball hobby box sealed', retail: 240, releaseDate: '2026-07-16', productType: 'hobby-box' },
  { key: '2025-topps-chrome-baseball', name: '2025 Topps Chrome Baseball', query: '2025 Topps Chrome Baseball hobby box sealed', retail: 200, releaseDate: '2025-07-23', productType: 'hobby-box' },
  { key: '2025-panini-prizm-basketball', name: '2025 Panini Prizm Basketball', query: '2025-26 Panini Prizm Basketball hobby box sealed', retail: 200, releaseDate: '2025-11-01', productType: 'hobby-box' },
  { key: '2024-panini-prizm-basketball', name: '2024 Panini Prizm Basketball', query: '2024-25 Panini Prizm Basketball hobby box sealed', retail: 200, releaseDate: '2024-11-08', productType: 'hobby-box' },
  { key: '2025-topps-bowman-chrome', name: '2025 Bowman Chrome Baseball', query: '2025 Bowman Chrome Baseball hobby box sealed', retail: 180, releaseDate: '2025-09-12', productType: 'hobby-box' },
  { key: '2024-topps-chrome-basketball', name: '2024 Topps Chrome Basketball NBA', query: '2024-25 Topps Chrome Basketball NBA hobby box sealed', retail: 200, releaseDate: '2024-12-06', productType: 'hobby-box' },
  { key: '2025-panini-national-treasures-basketball', name: '2025 National Treasures Basketball', query: '2024-25 Panini National Treasures Basketball hobby box sealed', retail: 1200, releaseDate: '2025-05-01', productType: 'hobby-box' },
  { key: '2024-panini-immaculate-basketball', name: '2024 Panini Immaculate Basketball', query: '2024-25 Panini Immaculate Basketball hobby box sealed', retail: 500, releaseDate: '2024-12-20', productType: 'hobby-box' },
  { key: '2025-topps-tier-one-baseball', name: '2025 Topps Tier One Baseball', query: '2025 Topps Tier One Baseball hobby box sealed', retail: 300, releaseDate: '2025-05-07', productType: 'hobby-box' },
  { key: '2025-topps-chrome-basketball-ucc', name: '2025 Topps Chrome Basketball UCC', query: '2025-26 Topps Chrome Basketball UCC hobby box sealed', retail: 200, releaseDate: '2025-12-01', productType: 'hobby-box' },
];

async function log(msg) { process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${msg}\n`); }

async function main() {
  const db = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  const sets = db.sets ?? {};
  let updated = 0;

  for (const s of SPORTS_SETS) {
    try {
      log(`Fetching ${s.key}...`);
      const ebay = await ebaySold(s.query, { retailFloor: s.retail * 0.5 });
      const stockx = await stockxMarket(s.query).catch(() => null);
      const current = ebay?.median30 ?? ebay?.median ?? stockx?.last ?? null;
      const ath = Math.max(ebay?.high ?? 0, stockx?.ask ?? 0, sets[s.key]?.products?.[s.productType]?.ath ?? 0) || null;
      const months = monthsAgo(s.releaseDate);

      if (!sets[s.key]) sets[s.key] = { name: s.name, releaseDate: s.releaseDate, retail: s.retail, retailVerified: true, products: {} };
      if (!sets[s.key].products[s.productType]) sets[s.key].products[s.productType] = {};
      const box = sets[s.key].products[s.productType];
      if (current) box.current = Math.round(current * 100) / 100;
      if (ath) box.ath = Math.round(ath * 100) / 100;
      if (months) box.months = months;
      updated++;
      log(`  ${s.key}: current=$${current ?? 'n/a'} ath=$${ath ?? 'n/a'}`);
    } catch(e) {
      log(`  Error ${s.key}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2500));
  }

  db.sets = sets;
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  log(`Done. Updated ${updated} Sports sets.`);
}

main().catch(console.error);
