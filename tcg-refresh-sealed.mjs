#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];
const LOG = 'tcg-refresh-sealed.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

function getPriceCharting(setName) {
  try {
    const json = execSync(`curl -s "https://www.pricecharting.com/api/products?q=${encodeURIComponent(setName)}" --max-time 8`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000
    });
    const data = JSON.parse(json);
    if (!data.products || data.products.length === 0) return null;
    return parseFloat(data.products[0].loose_price || 0);
  } catch { return null; }
}

function getStockX(setName) {
  try {
    const json = execSync(`curl -s "https://api.stockx.com/catalog/search?q=${encodeURIComponent(setName)}" --max-time 8 -H "User-Agent: Mozilla/5.0"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000
    });
    const data = JSON.parse(json);
    if (!data.hits || data.hits.length === 0) return null;
    return parseFloat(data.hits[0]?.lastSale || data.hits[0]?.retailPrice || 0);
  } catch { return null; }
}

async function main() {
  log(`[tcg-refresh-sealed] ${new Date().toISOString()}`);
  let setsUpdated = 0;

  DBs.forEach(dbFile => {
    try {
      const db = JSON.parse(readFileSync(dbFile, 'utf8'));
      const sets = db.sets || db;
      
      Object.entries(sets).forEach(([setKey, set]) => {
        if (!set.products) return;
        const label = set.label || set.set_name || setKey;

        log(`  [${setKey}] fetching sealed...`);
        const pcPrice = getPriceCharting(label);
        const sxPrice = getStockX(label);
        
        // Update each product variant with sealed market price
        Object.entries(set.products).forEach(([fmt, prod]) => {
          const market = pcPrice || sxPrice || prod.market;
          if (market) {
            prod.market = parseFloat(market.toFixed(2));
            
            // Compare sealed vs crack
            if (set.cards && set.cards.chaseTotal) {
              const verdict = market > set.cards.chaseTotal ? 'HOLD sealed' : 'CRACK singles';
              prod.verdict = verdict;
            }
          }
        });
        
        setsUpdated++;
        log(`    ✓ ${label}: ${sxPrice ? '$'+sxPrice : 'N/A'}`);
      });
      
      writeFileSync(dbFile, JSON.stringify(db, null, 2));
    } catch (e) {
      log(`  ERROR ${dbFile}: ${e.message}`);
    }
  });

  log(`[COMPLETE] ${setsUpdated} sets updated\n`);
  appendFileSync('tcg-refresh-schedule.md', `- ${new Date().toISOString()}: COMPLETE sealed prices (${setsUpdated} sets)\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
