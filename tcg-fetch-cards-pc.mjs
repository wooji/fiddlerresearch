#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];
const LOG = 'tcg-fetch-cards-pc.log';

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

function pcFetchCards(setName, proxies, proxyIdx) {
  // Try PriceCharting API directly via proxy
  try {
    const proxy = proxies.length > 0 ? proxies[proxyIdx % proxies.length] : undefined;
    const cmd = proxy
      ? `curl -s "https://www.pricecharting.com/api/products?q=${encodeURIComponent(setName)}&sort=bestselling" -x "${proxy}" -A "Mozilla/5.0" --max-time 8`
      : `curl -s "https://www.pricecharting.com/api/products?q=${encodeURIComponent(setName)}&sort=bestselling" -A "Mozilla/5.0" --max-time 8`;

    const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
    const data = JSON.parse(result);

    if (data.products && data.products.length > 0) {
      return data.products
        .filter(p => p.loose_price && p.loose_price > 0)
        .slice(0, 50)  // Top 50 cards per set
        .map(p => ({
          cardId: p.product_id || p.ean || 'unknown',
          name: (p.product_name || 'Unknown').slice(0, 80),
          market: parseFloat((p.loose_price || 0).toFixed(2)),
          priceHistory: [
            { date: new Date().toISOString().split('T')[0], price: parseFloat((p.loose_price || 0).toFixed(2)), source: 'pricecharting' }
          ],
          fetchedAt: new Date().toISOString()
        }));
    }
  } catch (e) {
    log(`    [pc-api] ${e.message.split('\n')[0]}`);
  }

  return [];
}

async function main() {
  log(`[tcg-fetch-cards-pc] ${new Date().toISOString()}`);
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
        const cards = pcFetchCards(setName, proxies, proxyIdx);
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
