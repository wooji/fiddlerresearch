#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

// Requires TCGPlayer OAuth token in env var TCG_BEARER_TOKEN
const BEARER = process.env.TCG_BEARER_TOKEN;
const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];
const LOG = 'tcg-fetch-cards.log';

if (!BEARER) {
  console.error('ERROR: TCG_BEARER_TOKEN not set');
  process.exit(1);
}

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

function tcgFetchCards(productId) {
  try {
    const json = execSync(`curl -s "https://api.tcgplayer.com/catalog/products/${productId}/skus" -H "Authorization: Bearer ${BEARER}" -H "User-Agent: Mozilla/5.0" --max-time 10`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 12000
    });
    const data = JSON.parse(json);
    if (!data.results || data.results.length === 0) return [];
    
    return data.results
      .filter(c => c.marketPrice && c.marketPrice > 0)
      .map(c => ({
        cardId: c.skuId || c.productId,
        name: c.productName.slice(0, 80),
        market: parseFloat(c.marketPrice.toFixed(2)),
        rarity: c.conditionId ? 'graded' : 'raw',
        priceHistory: [
          { date: new Date().toISOString().split('T')[0], price: parseFloat(c.marketPrice.toFixed(2)), source: 'tcgplayer' }
        ],
        fetchedAt: new Date().toISOString()
      }));
  } catch (e) {
    log(`  ERROR tcgFetchCards ${productId}: ${e.message}`);
    return [];
  }
}

async function main() {
  log(`[tcg-fetch-cards] ${new Date().toISOString()}`);
  let setsUpdated = 0, cardsTotal = 0;

  DBs.forEach(dbFile => {
    try {
      const db = JSON.parse(readFileSync(dbFile, 'utf8'));
      const sets = db.sets || db;
      
      Object.entries(sets).forEach(([setKey, set]) => {
        if (!set.label || !set.tcgId) return;
        
        log(`  [${setKey}] fetching ${set.label} (productId: ${set.tcgId})...`);
        const cards = tcgFetchCards(set.tcgId);
        
        if (cards.length > 0) {
          set.cards = set.cards || {};
          set.cards.fullCardList = cards;
          set.cards.fetchedAt = new Date().toISOString();
          
          cardsTotal += cards.length;
          setsUpdated++;
          log(`    ✓ ${cards.length} cards | avg $${(cards.reduce((s,c)=>s+c.market,0)/cards.length).toFixed(2)}`);
        } else {
          log(`    ✗ ${setKey} returned 0 cards`);
        }
      });
      
      writeFileSync(dbFile, JSON.stringify(db, null, 2));
    } catch (e) {
      log(`  ERROR ${dbFile}: ${e.message}`);
    }
  });

  log(`[COMPLETE] ${setsUpdated} sets updated, ${cardsTotal} total cards\n`);
  appendFileSync('tcg-refresh-schedule.md', `- ${new Date().toISOString()}: COMPLETE card fetch (${cardsTotal} cards in ${setsUpdated} sets)\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
