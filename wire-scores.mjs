// Wire real PriceCharting history into set-scores.json + assign tiers.
// MODERN sets (reliable MSRP) → tier by ATH multiple.
// VINTAGE sets (modern-MSRP multiple is garbage) → tier by absolute ATH value.
// Cutoff: peakMult >= 30 means modern MSRP can't be right → vintage scale.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const summary = JSON.parse(readFileSync(join(ROOT, '_set-summary.json'), 'utf8'));
const scores  = JSON.parse(readFileSync(join(ROOT, 'set-scores.json'), 'utf8'));
const hist    = JSON.parse(readFileSync(join(ROOT, 'set-history.json'), 'utf8'));
// real ATH $ (max across sealed products) + current $ per set slug
const athUsd = {}, nowUsd = {};
for (const [slug, s] of Object.entries(hist.sets)) {
  const ps = Object.values(s.products ?? {});
  if (ps.length) { athUsd[slug] = Math.max(...ps.map(p => p.ath)); nowUsd[slug] = Math.max(...ps.map(p => p.current)); }
}

// Era can't be derived from PriceCharting (it backfills old sets at random dates).
// Modern = genuine 2023+ SV/ME-era releases where the $149.99/$49.99/$26.99/$4.49
// MSRP defaults are correct → ATH multiple is valid. Everything else → vintage
// ATH-dollar scale (modern-MSRP multiple would be garbage). Match by name substring.
const MODERN_SETS = [
  'scarlet & violet 151','151','paldea evolved','obsidian flames','paradox rift','paldean fates',
  'temporal forces','twilight masquerade','shrouded fable','stellar crown','surging sparks',
  'prismatic evolutions','journey together','destined rivals','black bolt','white flare',
  'mega evolution','phantasmal flames','perfect order','chaos rising','ascended heroes','pitch black',
  'crown zenith','scarlet & violet','paldea','brilliant stars','astral radiance','lost origin',
  'silver tempest','evolving skies','fusion strike','battle styles','chilling reign','vivid voltage',
];
const isModern = name => MODERN_SETS.some(m => name === m || name.includes(m));
// Modern: tier by ATH multiple
const modernTier = m => m >= 10 ? 'S+' : m >= 6 ? 'S' : m >= 3.5 ? 'A' : m >= 2 ? 'B' : m >= 1.3 ? 'C' : 'D';
// Vintage: tier by absolute ATH value ($ of best sealed product)
const vintageTier = v => v >= 5000 ? 'S+' : v >= 2000 ? 'S' : v >= 1000 ? 'A' : v >= 500 ? 'B' : v >= 200 ? 'C' : 'D';

// preserve existing anchors/notes/ipTier by lowercase name
const prior = {};
for (const [k, v] of Object.entries(scores.sets)) prior[k.toLowerCase()] = v;

const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());
const out = {};
const dist = {};
for (const s of summary) {
  const ath$ = athUsd[s.slug] ?? 0;
  const now$ = nowUsd[s.slug] ?? 0;
  const vintage = !isModern(s.name.toLowerCase());
  const tier = vintage ? vintageTier(ath$) : modernTier(s.peakMult);
  const name = titleCase(s.name);
  const p = prior[s.name.toLowerCase()] ?? {};
  out[name] = {
    ...(p.anchor ? { anchor: p.anchor } : {}),
    ...(p.released ? { released: p.released } : {}),
    scale: vintage ? 'vintage' : 'modern',
    tier,
    athUsd: +ath$.toFixed(2),
    nowUsd: +now$.toFixed(2),
    athMultiple: +s.peakMult.toFixed(2),
    nowMultiple: +s.nowMult.toFixed(2),
    bestType: s.bestType,
    hierHolds: s.holds,
    historyFrom: s.from,
    ...(p.note ? { note: p.note } : {}),
  };
  if (!vintage) out[name].observedPeakMultiple = +s.peakMult.toFixed(2); // feeds live scoring
  dist[tier] = (dist[tier] ?? 0) + 1;
}

scores.sets = out;
scores._meta.updated = new Date().toISOString().slice(0,10);
scores._meta.tiering = 'modern: ATH multiple (S+≥10 S≥6 A≥3.5 B≥2 C≥1.3 D<1.3). vintage(mult≥30, MSRP unreliable): absolute scale, athMultiple shown is vs modern-MSRP proxy only.';
writeFileSync(join(ROOT, 'set-scores.json'), JSON.stringify(scores, null, 2));

console.log(`Wired ${Object.keys(out).length} sets into set-scores.json`);
console.log('Tier distribution:', JSON.stringify(dist));
const sorted = Object.entries(out).sort((a,b)=>b[1].athMultiple-a[1].athMultiple);
console.log('\nTop modern (real multiple):');
sorted.filter(([,v])=>v.scale==='modern').slice(0,12).forEach(([n,v])=>console.log(`  ${n.padEnd(26)} ${v.tier.padEnd(3)} ${v.athMultiple}× ATH | now ${v.nowMultiple}× | ${v.bestType}`));
console.log('\nSample vintage (ATH-value scale):');
sorted.filter(([,v])=>v.scale==='vintage').slice(0,8).forEach(([n,v])=>console.log(`  ${n.padEnd(26)} ${v.tier.padEnd(3)} (vintage)`));
