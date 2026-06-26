// Build set-history.csv from set-history.json + validate product hierarchy.
// Hierarchy (appreciation): booster-box > elite-trainer-box > booster-bundle > booster-pack.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const hist = JSON.parse(readFileSync(join(ROOT, 'set-history.json'), 'utf8'));

// Default original MSRP by sealed type (modern SV/ME era). Vintage flagged separately.
const MSRP = { 'booster-box': 149.99, 'elite-trainer-box': 49.99, 'booster-bundle': 26.99, 'booster-pack': 4.49 };
const TYPE_ABBR = { 'booster-box': 'Box', 'elite-trainer-box': 'ETB', 'booster-bundle': 'Bundle', 'booster-pack': 'Pack' };
const HIER = ['booster-box', 'elite-trainer-box', 'booster-bundle', 'booster-pack']; // high→low appreciation
const VINTAGE_BEFORE = '2011-01'; // pre-BW era — MSRP defaults unreliable

const rows = [['Set', 'Product', 'OrigMSRP', 'MarketNow', 'ATH', 'Mult_now', 'Mult_ATH', 'HistFrom', 'HierRank', 'HierHolds']];
const setSummary = [];

for (const [slug, s] of Object.entries(hist.sets)) {
  if (!s.products || !Object.keys(s.products).length) continue;
  const vintage = (s.firstMonth ?? '9999') < VINTAGE_BEFORE;
  // rank present types by current price (proxy for appreciation tier within set)
  const present = HIER.filter(t => s.products[t]);
  const byMult = {};
  for (const t of present) {
    const p = s.products[t];
    const msrp = MSRP[t];
    byMult[t] = +(p.current / msrp).toFixed(2);
  }
  // hierarchy holds if current-price ordering follows Box>ETB>Bundle>Pack
  const prices = present.map(t => s.products[t].current);
  const holds = prices.every((v, i) => i === 0 || prices[i-1] >= v);
  for (const t of present) {
    const p = s.products[t];
    const msrp = MSRP[t];
    rows.push([
      s.name, TYPE_ABBR[t],
      vintage ? `~${msrp}*` : msrp,
      p.current, p.ath,
      +(p.current/msrp).toFixed(2), +(p.ath/msrp).toFixed(2),
      p.firstMonth,
      HIER.indexOf(t)+1,
      holds ? 'Y' : 'N',
    ]);
  }
  // set-level peak for scoring — EXCLUDE booster-pack (single-pack ATH spikes from
  // sealed-pack grading distort the multiple). Use box/ETB/bundle only; fall back to
  // all types only if a set has nothing but packs.
  const scoreTypes = present.filter(t => t !== 'booster-pack');
  const useTypes = scoreTypes.length ? scoreTypes : present;
  const best = useTypes.reduce((a,t)=> byMult[t]>byMult[a]?t:a, useTypes[0]);
  setSummary.push({ slug, name: s.name, vintage, holds, types: present.length,
    peakMult: Math.max(...useTypes.map(t=>+(s.products[t].ath/MSRP[t]).toFixed(2))),
    nowMult:  Math.max(...useTypes.map(t=>byMult[t])), bestType: best, from: s.firstMonth });
}

const csv = rows.map(r => r.join(',')).join('\n');
writeFileSync(join(ROOT, 'set-history.csv'), csv);

// hierarchy validation summary
const withMulti = setSummary.filter(s => s.types >= 2);
const broke = withMulti.filter(s => !s.holds);
console.log(`Sets with data: ${setSummary.length} | rows: ${rows.length-1}`);
console.log(`Multi-product sets: ${withMulti.length} | hierarchy HOLDS: ${withMulti.length-broke.length} | BREAKS: ${broke.length}`);
console.log(`Hierarchy breaks:`, broke.map(s=>s.name).join(', ') || 'none');
console.log(`\nVintage (pre-2011, MSRP approx): ${setSummary.filter(s=>s.vintage).length}`);
console.log(`\nTop 15 by ATH multiple:`);
setSummary.sort((a,b)=>b.peakMult-a.peakMult).slice(0,15).forEach(s=>console.log(`  ${s.name.padEnd(28)} ${s.peakMult}× ATH | ${s.nowMult}× now | from ${s.from}`));
writeFileSync(join(ROOT, '_set-summary.json'), JSON.stringify(setSummary, null, 1));
