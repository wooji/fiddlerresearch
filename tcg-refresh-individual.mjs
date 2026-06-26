#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];
const LOG = 'tcg-refresh-individual.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

function tcgCards(productId) {
  try {
    const json = execSync(`curl -s "https://api.tcgplayer.com/catalog/products/${productId}/skus" --max-time 10 -A "Mozilla/5.0"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 12000
    });
    const data = JSON.parse(json);
    if (!data.results || data.results.length === 0) return [];
    
    return data.results
      .filter(c => c.marketPrice && c.marketPrice > 0)
      .sort((a, b) => b.marketPrice - a.marketPrice)
      .slice(0, 10)
      .map(c => ({ name: c.productName.slice(0, 60), price: parseFloat(c.marketPrice.toFixed(2)) }));
  } catch (e) {
    return [];
  }
}

async function main() {
  log(`[tcg-refresh-individual] ${new Date().toISOString()}`);
  let setsProcessed = 0, cardsFound = 0;

  DBs.forEach(dbFile => {
    try {
      const db = JSON.parse(readFileSync(dbFile, 'utf8'));
      const sets = db.sets || db;
      
      Object.entries(sets).forEach(([setKey, set]) => {
        if (!set.label) return;
        
        let tcgId = set.tcgId;
        if (!tcgId && set.products) {
          const firstProd = Object.values(set.products)[0];
          tcgId = firstProd?.tcgId;
        }
        if (!tcgId) return;
        
        log(`  [${setKey}] fetching...`);
        const cards = tcgCards(tcgId);
        
        if (cards.length > 0) {
          const total = cards.reduce((sum, c) => sum + c.price, 0);
          const avg = (total / cards.length).toFixed(2);
          
          set.cards = {
            chaseCards: cards,
            chaseTotal: parseFloat(total.toFixed(2)),
            avgChasePrice: parseFloat(avg),
            fetchedAt: new Date().toISOString()
          };
          
          cardsFound++;
          log(`    ✓ ${cards.length} cards | $${total.toFixed(2)}`);
        }
        setsProcessed++;
      });
      
      writeFileSync(dbFile, JSON.stringify(db, null, 2));
    } catch (e) {
      log(`  ERROR ${dbFile}: ${e.message}`);
    }
  });

  log(`[COMPLETE] ${setsProcessed} sets scanned, ${cardsFound} updated\n`);
  appendFileSync('tcg-refresh-schedule.md', `- ${new Date().toISOString()}: COMPLETE individual cards (${cardsFound} sets)\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
