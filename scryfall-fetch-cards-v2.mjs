#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

const DB_FILE = 'set-history-mtg.json';
const LOG = 'scryfall-fetch-cards-v2.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

function scryfallFetch(url) {
  try {
    const json = execSync(`curl -s "${url}" --max-time 8`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

async function buildSetCodeMap() {
  log(`  Building Scryfall set code map...`);
  const data = scryfallFetch('https://api.scryfall.com/sets');
  if (!data || !data.data) return {};

  const map = {};
  data.data.forEach(set => {
    // Skip tokens, promos, art series, extra tokens — keep only base sets and commander/variants
    if (/(tokens?|promos?|art series|extra)/i.test(set.name)) return;

    map[set.name.toLowerCase()] = set.code;
    map[set.code.toLowerCase()] = set.code;
  });

  log(`    → ${Object.keys(map).length} mappings loaded`);
  return map;
}

function findSetCode(setName, codeMap) {
  const lower = setName.toLowerCase();

  // Exact match first
  if (codeMap[lower]) return codeMap[lower];

  // Substring match — find longest matching key
  let best = null;
  let bestLen = 0;
  for (const [key, code] of Object.entries(codeMap)) {
    if (lower.includes(key) && key.length > bestLen) {
      best = code;
      bestLen = key.length;
    }
  }

  return best;
}

async function fetchSetCards(setCode, setName) {
  const cards = [];
  const date = new Date().toISOString().split('T')[0];

  try {
    const url = `https://api.scryfall.com/cards/search?q=set:${setCode}&unique=prints&order=released`;

    const data = scryfallFetch(url);
    if (!data || !data.data || data.data.length === 0) {
      return cards;
    }

    data.data.forEach(card => {
      const usdPrice = card.prices?.usd ? parseFloat(card.prices.usd) : null;
      const eurPrice = card.prices?.eur ? parseFloat(card.prices.eur) : null;
      const marketPrice = usdPrice || eurPrice;

      if (marketPrice && marketPrice > 0) {
        cards.push({
          cardId: card.id,
          name: card.name,
          set: card.set.toUpperCase(),
          rarity: card.rarity || 'unknown',
          market: parseFloat(marketPrice.toFixed(2)),
          priceHistory: [
            { date, price: parseFloat(marketPrice.toFixed(2)), source: 'scryfall' }
          ],
          fetchedAt: new Date().toISOString()
        });
      }
    });

    return cards;
  } catch (e) {
    log(`    [error] ${e.message.split('\n')[0]}`);
    return cards;
  }
}

async function main() {
  log(`[scryfall-fetch-cards-v2] ${new Date().toISOString()}`);

  const codeMap = await buildSetCodeMap();

  try {
    const db = JSON.parse(readFileSync(DB_FILE, 'utf8'));
    const sets = db.sets || db;
    let setsUpdated = 0, cardsTotal = 0, skipped = 0;

    for (const [setKey, set] of Object.entries(sets)) {
      const setName = set.name || set.label || setKey;

      const setCode = findSetCode(setName, codeMap);

      if (!setCode) {
        log(`  [SKIP] ${setName} (no Scryfall code found)`);
        skipped++;
        continue;
      }

      log(`  [${setKey}] ${setName} (code: ${setCode})`);

      const cards = await fetchSetCards(setCode, setName);

      if (cards.length > 0) {
        set.cards = set.cards || {};
        set.cards.fullCardList = cards;
        set.cards.fetchedAt = new Date().toISOString();

        cardsTotal += cards.length;
        setsUpdated++;

        const avgPrice = (cards.reduce((s, c) => s + c.market, 0) / cards.length).toFixed(2);
        log(`    ✓ ${cards.length} cards | avg $${avgPrice}`);

        // Throttle
        await new Promise(r => setTimeout(r, 800));
      }
    }

    const output = db.sets ? db : sets;
    writeFileSync(DB_FILE, JSON.stringify(output, null, 2));

    log(`[COMPLETE] ${setsUpdated} sets, ${cardsTotal} cards total, ${skipped} skipped\n`);
  } catch (e) {
    log(`FATAL: ${e.message}`);
    process.exit(1);
  }
}

main();
