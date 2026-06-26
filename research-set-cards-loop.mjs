#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];
const LOG = 'research-set-cards.log';

function log(msg) { console.log(msg); appendFileSync(LOG, msg + '\n'); }

function tcgCards(productId) {
  try {
    const json = execSync(`curl -s "https://api.tcgplayer.com/catalog/products/${productId}/skus" --max-time 8 -A "Mozilla/5.0"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000
    });
    const data = JSON.parse(json);
    if (!data.results) return [];
    
    return data.results
      .sort((a, b) => (b.marketPrice || 0) - (a.marketPrice || 0))
      .slice(0, 10)
      .map(c => ({ name: c.productName, price: c.marketPrice || 0 }));
  } catch { return []; }
}

async function main() {
  log(`[research-set-cards] ${new Date().toISOString()}`);
  let processedSets = 0, foundCards = 0;

  DBs.forEach(dbFile => {
    try {
      const db = JSON.parse(readFileSync(dbFile, 'utf8'));
      const sets = db.sets || db;
      
      Object.entries(sets).forEach(([setKey, set]) => {
        if (!set.label || set.cards) return;
        
        let tcgId = set.tcgId;
        if (!tcgId && set.products) {
          const firstProduct = Object.values(set.products)[0];
          tcgId = firstProduct?.tcgId;
        }
        
        if (!tcgId) return;
        
        log(`  [${setKey}] fetching...`);
        const cards = tcgCards(tcgId);
        
        if (cards.length > 0) {
          const chaseTotal = cards.reduce((sum, c) => sum + c.price, 0);
          const avgPrice = (chaseTotal / cards.length).toFixed(2);
          
          set.cards = {
            chaseCards: cards,
            chaseTotal: chaseTotal.toFixed(2),
            avgChasePrice: avgPrice,
            fetchedAt: new Date().toISOString()
          };
          
          foundCards++;
          log(`    ✓ ${cards.length} cards | $${chaseTotal.toFixed(2)}`);
        }
        processedSets++;
      });
      
      writeFileSync(dbFile, JSON.stringify(db, null, 2));
    } catch (e) {
      log(`  ERROR ${dbFile}: ${e.message}`);
    }
  });

  log(`[COMPLETE] ${processedSets} sets processed, ${foundCards} with cards\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
