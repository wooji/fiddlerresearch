// Build set-history.csv from set-history.json + validate product hierarchy.
// HierRank: 1=SPC/UPC, 2=Booster Display Box, 3=ETB, 4=Collection Box, 5=Bundle, 6=Pack
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const hist = JSON.parse(readFileSync(join(ROOT, 'set-history.json'), 'utf8'));

// Default original MSRP by sealed type (modern SV/ME era). Vintage flagged separately.
const MSRP = { 'booster-box': 149.99, 'elite-trainer-box': 49.99, 'booster-bundle': 26.99, 'booster-pack': 4.49 };
const TYPE_ABBR = { 'booster-box': 'Box', 'elite-trainer-box': 'ETB', 'booster-bundle': 'Bundle', 'booster-pack': 'Pack' };
// HierRank per type: 2=Display Box, 3=ETB, 5=Bundle, 6=Pack (1=SPC/UPC appended separately)
const HIER_RANK = { 'booster-box': '2', 'elite-trainer-box': '3', 'booster-bundle': '5', 'booster-pack': '6' };
const HIER = ['booster-box', 'elite-trainer-box', 'booster-bundle', 'booster-pack']; // high→low appreciation
const VINTAGE_BEFORE = '2011-01'; // pre-BW era — MSRP defaults unreliable

// Detect region from set slug/name
function regionOf(slug) {
  const s = slug.toLowerCase();
  if (s.startsWith('japanese') || s.includes('japanese-')) return 'JP';
  if (s.startsWith('korean') || s.includes('korean-')) return 'KR';
  if (s.startsWith('chinese') || s.includes('chinese-')) return 'CN';
  return 'EN';
}

const rows = [['Set', 'Product', 'OrigMSRP', 'MarketNow', 'ATH', 'Mult_now', 'Mult_ATH', 'HistFrom', 'HierRank', 'HierHolds', 'Region']];
const setSummary = [];

for (const [slug, s] of Object.entries(hist.sets)) {
  if (!s.products || !Object.keys(s.products).length) continue;
  const vintage = (s.firstMonth ?? '9999') < VINTAGE_BEFORE;
  // rank present types by current price (proxy for appreciation tier within set)
  // product keys are prefixed: "pitch-black-booster-box" — match by suffix
  const productKeyOf = t => Object.keys(s.products ?? {}).find(k => k.endsWith('-' + t) || k === t);
  const present = HIER.filter(t => productKeyOf(t));
  // p.market = current price; compute ATH from priceHistory max
  const pOf = t => s.products[productKeyOf(t)];
  const athOf = p => p.priceHistory?.length ? Math.max(...p.priceHistory.map(h=>h.price)) : (p.market ?? 0);
  const byMult = {};
  for (const t of present) {
    const p = pOf(t);
    const msrp = p.msrp ?? MSRP[t];
    byMult[t] = msrp > 0 ? +(p.market / msrp).toFixed(2) : 0;
  }
  // hierarchy holds if current-price ordering follows Box>ETB>Bundle>Pack
  const prices = present.map(t => pOf(t).market ?? 0);
  const holds = prices.every((v, i) => i === 0 || prices[i-1] >= v);
  const region = regionOf(slug);
  const setName = s.set_name ?? s.name ?? slug;
  for (const t of present) {
    const p = pOf(t);
    const msrp = p.msrp ?? MSRP[t];
    const ath = athOf(p);
    const firstMonth = p.priceHistory?.[0]?.date?.slice(0,7) ?? p.fetchedAt?.slice(0,7) ?? '';
    rows.push([
      setName, TYPE_ABBR[t],
      vintage ? `~${msrp}*` : msrp,
      p.market ?? '', ath || '',
      msrp > 0 ? +((p.market??0)/msrp).toFixed(2) : '',
      msrp > 0 ? +(ath/msrp).toFixed(2) : '',
      firstMonth,
      HIER_RANK[t],
      holds ? 'Y' : 'N',
      region,
    ]);
  }
  const scoreTypes = present.filter(t => t !== 'booster-pack');
  const useTypes = scoreTypes.length ? scoreTypes : present;
  const best = useTypes.reduce((a,t)=> byMult[t]>byMult[a]?t:a, useTypes[0]);
  setSummary.push({ slug, name: setName, vintage, holds, types: present.length,
    peakMult: Math.max(...useTypes.map(t=>{ const p=pOf(t); const msrp=p.msrp??MSRP[t]; return msrp>0?+(athOf(p)/msrp).toFixed(2):0; })),
    nowMult:  Math.max(...useTypes.map(t=>byMult[t])), bestType: best, from: s.publishedOn?.slice(0,7) ?? '' });
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
