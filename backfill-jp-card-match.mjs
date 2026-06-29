#!/usr/bin/env node
// JP→EN card-level 1:1 matching within mapped set pairs.
// For each JP set with enSetKey, match JP cards to EN cards by:
//   1. Card number (primary — same slot = same card, just different language)
//   2. Normalized name fallback (strip suffixes, lowercase, no special chars)
// Output: set.cards.fullCardList[].enCard = { name, number, market } for each matched card
// Also writes set.cardMatches[] = [{jpName, jpNum, jpMarket, enName, enNum, enMarket, premium}]

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

function normName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s*-\s*\d+\/\d+\s*$/, '')  // strip " - 001/073" suffix
    .replace(/\bex\b|\bv\b|\bvmax\b|\bvstar\b|\bgx\b|\beast\b|\bwild\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function normNum(s) {
  // "001/073" → "001", "SV001/SV198" → "sv001"
  return String(s ?? '').toLowerCase().split('/')[0].replace(/^0+/, '') || null;
}

let totalSets = 0, totalMatched = 0, totalCards = 0;

const mapped = Object.entries(jpSets).filter(([, v]) => v.enSetKey);
console.log(`Mapped JP→EN sets: ${mapped.length}`);

for (const [jpKey, jpSet] of mapped) {
  const enKey = jpSet.enSetKey;
  const enSet = enSets[enKey];
  if (!enSet) continue;

  const jpCards = jpSet.cards?.fullCardList ?? [];
  const enCards = enSet.cards?.fullCardList ?? [];
  if (!jpCards.length || !enCards.length) {
    console.log(`  [${jpKey}] JP:${jpCards.length} EN:${enCards.length} — skip (no cards)`);
    continue;
  }

  // Build EN index: by normalized name → pick highest market variant (multiple rarities same name)
  // NOTE: cross-set JP→EN card numbers never align — name-only matching required.
  const enByName = {};
  for (const c of enCards) {
    const nm = normName(c.name);
    if (!nm) continue;
    if (!enByName[nm] || (c.market ?? 0) > (enByName[nm].market ?? 0)) enByName[nm] = c;
  }

  const matches = [];
  let matchCount = 0;

  for (const jpCard of jpCards) {
    const jpNm = normName(jpCard.name);
    const enCard = enByName[jpNm] ?? null;
    if (!enCard) continue;

    matchCount++;
    const premium = (jpCard.market && enCard.market)
      ? Math.round((enCard.market / jpCard.market) * 100) / 100
      : null;

    // Annotate JP card record inline
    jpCard.enCard = {
      name:    enCard.name,
      number:  enCard.number,
      market:  enCard.market ?? null,
      premium, // EN/JP ratio; >1 = EN trades above JP
    };

    if (jpCard.market > 5 || (enCard.market ?? 0) > 5) {
      matches.push({
        jpName:   jpCard.name,
        jpNum:    jpCard.number,
        jpMarket: jpCard.market,
        enName:   enCard.name,
        enNum:    enCard.number,
        enMarket: enCard.market ?? null,
        premium,
      });
    }

    totalCards++;
  }

  // Sort matches by JP market desc
  matches.sort((a, b) => b.jpMarket - a.jpMarket);
  jpSet.cardMatches = matches;

  totalSets++;
  totalMatched += matchCount;

  const pct = Math.round(matchCount / jpCards.length * 100);
  console.log(`  [${jpKey}] → ${enKey} | ${matchCount}/${jpCards.length} cards matched (${pct}%)`);
  if (matches.length) {
    console.log(`    top: ${matches[0].jpName} JP$${matches[0].jpMarket} → EN$${matches[0].enMarket ?? '?'} (${matches[0].premium ?? '?'}×)`);
  }
}

writeFileSync(JP_PATH, JSON.stringify(jpDb, null, 2));
console.log(`\n✅ ${totalSets} set pairs | ${totalMatched} card links | ${totalCards} notable | written → ${JP_PATH}`);
