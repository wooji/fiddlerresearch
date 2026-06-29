#!/usr/bin/env node
// Autonomous JP Pokemon enrichment loop.
// For every JP set in set-history-pokemon-jp.json:
//   1. Derive top chase cards from fullCardList
//   2. Compute sealed market from products{}
//   3. Map to EN set counterpart (set-history.json name match)
//   4. Write enriched record back — chaseCards[], sealedMarket, enSetKey, enSetName, multiple
// Runs sequentially (no external scraping needed — all data already in TCGCSV DB).
// Re-run anytime to refresh after tcgcsv-csv-fetcher refresh.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const JP_PATH = join(ROOT, 'set-history-pokemon-jp.json');
const EN_PATH = join(ROOT, 'set-history.json');

const jpDb = JSON.parse(readFileSync(JP_PATH, 'utf8'));
const enDb = JSON.parse(readFileSync(EN_PATH, 'utf8'));

const jpSets = jpDb.sets ?? jpDb;
const enSets = enDb.sets ?? enDb;

// Build EN lookup by normalized name
function norm(s) { return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

const enByNorm = {};
for (const [k, v] of Object.entries(enSets)) {
  const n = norm(v.set_name ?? v.name ?? k);
  enByNorm[n] = { key: k, ...v };
}

// JP→EN set name mappings (known translations)
const JP_TO_EN = {
  'wildforce': 'twilight-masquerade',          // SV6
  'maskofchange': 'twilight-masquerade',
  'nightwanderer': 'shrouded-fable',            // SV6a
  'stellarmiraclechampionfest': 'stellar-crown', // SV7
  'paradoxrift': 'paradox-rift',
  'obsidianflames': 'obsidian-flames',
  'palefire': 'obsidian-flames',
  'explosionseedfield': 'paldean-fates',
  'paldeanfates': 'paldean-fates',
  'temporalforces': 'temporal-forces',
  'cyberforge': 'temporal-forces',
  'cyberfield': 'paldea-evolved',
  'tripletbeat': 'paldea-evolved',
  'scarletex': 'scarlet-violet',
  'violetex': 'scarlet-violet',
  'crimsondestruction': '151',
  'pokemoncardgame151': '151',
  'shiningtreasureex': 'pokemon-card-151',
  'hereaftersurge': 'surging-sparks',
  'ragingrifts': 'surging-sparks',
  'surgingsparks': 'surging-sparks',
  'terraspectacle': 'prismatic-evolutions',
  'prismaticevolutions': 'prismatic-evolutions',
  'megastart': 'journey-together',
  'abysseye': 'journey-together',
  'ninjaspinner': 'journey-together',
};

function findEnSet(jpKey, jpName) {
  const jpNorm = norm(jpName ?? jpKey);
  // Direct map check
  for (const [frag, enKey] of Object.entries(JP_TO_EN)) {
    if (jpNorm.includes(frag)) return enKey;
  }
  // Fuzzy: try word fragments from JP name vs EN name
  const words = jpNorm.match(/[a-z0-9]{4,}/g) ?? [];
  let best = null, bestScore = 0;
  for (const [enKey, enV] of Object.entries(enSets)) {
    const enNorm = norm(enV.set_name ?? enV.name ?? enKey);
    const overlap = words.filter(w => enNorm.includes(w)).length;
    if (overlap > bestScore) { bestScore = overlap; best = enKey; }
  }
  return bestScore >= 2 ? best : null;
}

// Sealed product key patterns (JP sealed product names)
const SEALED_KEYS = [
  /booster.*box|box.*booster/i,
  /pack/i,
  /elite.*trainer|\betb\b/i,
  /collection/i,
  /display/i,
];

function bestSealedPrice(products) {
  if (!products || !Object.keys(products).length) return null;
  // prefer booster box
  for (const [k, v] of Object.entries(products)) {
    if (/booster.*box|box.*booster/i.test(k) || /booster.*box/i.test(v.name ?? '')) {
      if (v.market > 0) return { key: k, price: v.market, name: v.name ?? k };
    }
  }
  // fallback: highest market
  let best = null;
  for (const [k, v] of Object.entries(products)) {
    if (v.market > 0 && (!best || v.market > best.price)) best = { key: k, price: v.market, name: v.name ?? k };
  }
  return best;
}

let processed = 0, enriched = 0, mapped = 0;

// Sort by publishedOn desc (most recent first)
const entries = Object.entries(jpSets).sort((a, b) => {
  const da = new Date(a[1].publishedOn ?? 0), db2 = new Date(b[1].publishedOn ?? 0);
  return db2 - da;
});

for (const [key, set] of entries) {
  processed++;
  const cards = set.cards?.fullCardList ?? [];
  if (!cards.length && !Object.keys(set.products ?? {}).length) continue;

  // Top 10 chase cards
  const chaseCards = cards
    .filter(c => c.market > 1)
    .sort((a, b) => b.market - a.market)
    .slice(0, 10)
    .map(c => ({ name: c.name, market: c.market, rarity: c.rarity ?? null, number: c.number ?? null }));

  // Top 3 for summary
  const top3 = chaseCards.slice(0, 3).map(c => `${c.name} $${c.market.toFixed(2)}`).join(' · ');

  // Average chase price (top 10)
  const avgChasePrice = chaseCards.length
    ? Math.round(chaseCards.reduce((a, c) => a + c.market, 0) / chaseCards.length * 100) / 100
    : null;

  // Sealed market
  const sealedHit = bestSealedPrice(set.products ?? {});
  const sealedMarket = sealedHit?.price ?? null;

  // Multiple vs retail (JP retail ~$30 booster box equiv; use 30 as JP booster box MSRP if unknown)
  const jpRetailEst = set.retail ?? 30;
  const multiple = sealedMarket ? Math.round((sealedMarket / jpRetailEst) * 10) / 10 : null;

  // EN mapping
  const enKey = findEnSet(key, set.name ?? set.set_name);
  const enSet = enKey ? enSets[enKey] : null;
  const enSetName = enSet?.set_name ?? enSet?.name ?? null;

  // Signal strength
  const signal = !multiple ? 'no-data'
    : multiple >= 2   ? 'STRONG'
    : multiple >= 1.3 ? 'MODERATE'
    : 'WEAK';

  // Write enriched data back
  set.chaseCards = chaseCards;
  set.chaseTotal = chaseCards.length;
  set.avgChasePrice = avgChasePrice;
  set.sealedMarket = sealedMarket;
  set.jpRetailEst = jpRetailEst;
  set.sealedMultiple = multiple;
  set.leadSignal = signal;
  if (enKey) { set.enSetKey = enKey; set.enSetName = enSetName; mapped++; }
  set.enrichedAt = new Date().toISOString();

  enriched++;

  const yr = set.publishedOn?.slice(0, 4) ?? '????';
  const label = (set.name ?? key).slice(0, 40).padEnd(40);
  const chaseStr = top3 || '(no cards)';
  const sealedStr = sealedMarket ? `sealed $${sealedMarket.toFixed(0)} (${multiple}×)` : 'no sealed';
  const enStr = enKey ? `→ EN:${enKey}` : '→ EN:?';
  console.log(`[${yr}] ${label} | ${signal.padEnd(8)} | ${sealedStr.padEnd(22)} | ${enStr}`);
  if (top3) console.log(`        chase: ${chaseStr}`);
}

writeFileSync(JP_PATH, JSON.stringify(jpDb, null, 2));
console.log(`\n✅ Enriched ${enriched}/${processed} JP sets | ${mapped} mapped to EN | ${JP_PATH}`);
