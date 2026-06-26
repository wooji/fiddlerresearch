#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];
const LOG = 'tcg-fetch-cards.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

function loadProxies() {
  try {
    const isp = readFileSync('C:/Users/Christopher/Desktop/ISP.txt', 'utf8').split('\n').filter(l => l.trim());
    const resi = readFileSync('C:/Users/Christopher/Desktop/heroresi.txt', 'utf8').split('\n').filter(l => l.trim());
    return [...isp, ...resi].map(p => {
      const [host, port, user, pass] = p.split(':');
      return `http://${user}:${pass}@${host}:${port}`;
    });
  } catch { return []; }
}

function tcgFetchCards(productId, proxies, proxyIdx) {
  const methods = [
    // Method 1: TCGPlayer OAuth API
    () => {
      const token = process.env.TCG_BEARER_TOKEN;
      if (!token) throw new Error('No TCG_BEARER_TOKEN');
      return execSync(`curl -s "https://api.tcgplayer.com/catalog/products/${productId}/skus" -H "Authorization: Bearer ${token}" --max-time 8`, {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000
      });
    },
    // Method 2: TCGPlayer public scrape via proxy
    () => {
      if (proxies.length === 0) throw new Error('No proxies');
      const proxy = proxies[proxyIdx % proxies.length];
      return execSync(`curl -s "https://www.tcgplayer.com/search/product?id=${productId}" -x "${proxy}" -A "Mozilla/5.0" --max-time 8`, {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000
      });
    },
    // Method 3: Cardmarket EU fallback via proxy
    () => {
      if (proxies.length === 0) throw new Error('No proxies');
      const proxy = proxies[(proxyIdx + Math.floor(Math.random() * 100)) % proxies.length];
      return execSync(`curl -s "https://www.cardmarket.com/api/v2/products/${productId}" -x "${proxy}" -A "Mozilla/5.0" --max-time 8`, {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000
      });
    }
  ];

  for (let i = 0; i < methods.length; i++) {
    try {
      const result = methods[i]();
      const data = JSON.parse(result);
      if (data.results && data.results.length > 0) {
        return data.results
          .filter(c => c.marketPrice && c.marketPrice > 0)
          .map(c => ({
            cardId: c.skuId || c.productId || c.idProduct,
            name: (c.productName || c.name || 'Unknown').slice(0, 80),
            market: parseFloat((c.marketPrice || c.price || 0).toFixed(2)),
            priceHistory: [
              { date: new Date().toISOString().split('T')[0], price: parseFloat((c.marketPrice || c.price || 0).toFixed(2)), source: 'tcgplayer' }
            ],
            fetchedAt: new Date().toISOString()
          }));
      }
    } catch (e) {
      if (i === methods.length - 1) throw e;
    }
  }
  return [];
}

async function main() {
  log(`[tcg-fetch-cards-v2] ${new Date().toISOString()}`);
  const proxies = loadProxies();
  log(`  Loaded ${proxies.length} proxies`);
  
  let setsUpdated = 0, cardsTotal = 0, proxyIdx = 0;

  DBs.forEach(dbFile => {
    try {
      const db = JSON.parse(readFileSync(dbFile, 'utf8'));
      const sets = db.sets || db;
      
      Object.entries(sets).forEach(([setKey, set]) => {
        if (!set.tcgId) return;
        const setName = set.label || set.name || set.set_name || setKey;

        log(`  [${setKey}] fetching ${setName}...`);
        const cards = tcgFetchCards(set.tcgId, proxies, proxyIdx);
        proxyIdx += Math.floor(Math.random() * 10);
        
        if (cards.length > 0) {
          set.cards = set.cards || {};
          set.cards.fullCardList = cards;
          set.cards.fetchedAt = new Date().toISOString();
          
          cardsTotal += cards.length;
          setsUpdated++;
          const avg = (cards.reduce((s, c) => s + c.market, 0) / cards.length).toFixed(2);
          log(`    ✓ ${cards.length} cards | avg $${avg}`);
        }
      });
      
      writeFileSync(dbFile, JSON.stringify(db, null, 2));
    } catch (e) {
      log(`  ERROR ${dbFile}: ${e.message}`);
    }
  });

  log(`[COMPLETE] ${setsUpdated} sets, ${cardsTotal} cards\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
