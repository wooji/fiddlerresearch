#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

const DB_FILE = 'set-history-mtg.json';
const LOG = 'scryfall-fetch-cards.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

async function scryfallFetch(url) {
  try {
    const json = execSync(`curl -s "${url}" --max-time 8`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(json);
  } catch (e) {
    log(`  [fetch-error] ${e.message.split('\n')[0].slice(0, 50)}`);
    return null;
  }
}

async function fetchSetCards(setCode, setName) {
  const cards = [];
  const date = new Date().toISOString().split('T')[0];

  try {
    // Scryfall query: all cards in set, include prices
    const url = `https://api.scryfall.com/cards/search?q=set:${setCode}&unique=prints&order=released`;

    log(`    Fetching ${setCode}: ${url.slice(0, 60)}...`);
    const data = await scryfallFetch(url);

    if (!data || !data.data) {
      log(`    ✗ No data returned`);
      return cards;
    }

    data.data.forEach(card => {
      // Extract price — Scryfall returns USD price
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

    log(`    ✓ ${cards.length} cards with prices`);
    return cards;
  } catch (e) {
    log(`  [error] ${setCode}: ${e.message.split('\n')[0]}`);
    return cards;
  }
}

async function main() {
  log(`[scryfall-fetch-cards] ${new Date().toISOString()}`);

  try {
    const db = JSON.parse(readFileSync(DB_FILE, 'utf8'));
    const sets = db.sets || db;
    let setsUpdated = 0, cardsTotal = 0;

    // Fetch cards for each set
    for (const [setKey, set] of Object.entries(sets)) {
      if (!set.code && !set.set_name) continue;

      const setCode = set.code || (set.set_name ? set.set_name.split(' ').pop() : setKey);
      const setName = set.label || set.name || set.set_name || setKey;

      log(`  [${setKey}] ${setName}`);

      const cards = await fetchSetCards(setCode, setName);

      if (cards.length > 0) {
        set.cards = set.cards || {};
        set.cards.fullCardList = cards;
        set.cards.fetchedAt = new Date().toISOString();

        cardsTotal += cards.length;
        setsUpdated++;

        const avgPrice = (cards.reduce((s, c) => s + c.market, 0) / cards.length).toFixed(2);
        log(`    avg price: $${avgPrice}`);

        // Throttle to avoid rate limits
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const output = db.sets ? db : sets;
    writeFileSync(DB_FILE, JSON.stringify(output, null, 2));

    log(`[COMPLETE] ${setsUpdated} sets, ${cardsTotal} cards total\n`);
  } catch (e) {
    log(`FATAL: ${e.message}`);
    process.exit(1);
  }
}

main();
