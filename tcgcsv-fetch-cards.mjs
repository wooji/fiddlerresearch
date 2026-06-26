#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

const LOG = 'tcgcsv-fetch-cards.log';
const API = 'https://tcgcsv.com/tcgplayer';

// Category → DB file mapping
const CATS = {
  3: { name: 'Pokemon', db: 'set-history.json' },
  1: { name: 'Magic', db: 'set-history-mtg.json' },
  // 4: { name: 'Lorcana', db: 'set-history-lorcana.json' },
  // Add One Piece, sports if available in tcgcsv
};

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

function apiFetch(url) {
  try {
    const json = execSync(`curl -s "${url}" --max-time 10`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(json);
  } catch (e) {
    log(`  [api-error] ${e.message.split('\n')[0].slice(0, 50)}`);
    return null;
  }
}

async function fetchSetProducts(groupId, groupName, categoryName) {
  const products = [];
  const date = new Date().toISOString().split('T')[0];

  try {
    // Fetch products for this group/set
    const url = `${API}/groups/${groupId}/products`;
    log(`    [${groupName}] fetching products...`);

    const data = apiFetch(url);
    if (!data || !data.length) {
      log(`      0 products`);
      return products;
    }

    data.forEach(prod => {
      // Individual cards only (filter out sealed boxes)
      if (!prod.name || !prod.prices) return;

      const marketPrice = prod.prices?.market || prod.prices?.low || null;
      if (!marketPrice || marketPrice <= 0) return;

      // Skip obvious sealed boxes
      if (/(booster|box|pack|etb|collection|bundle|display|case|deck|starter)/i.test(prod.name)) {
        return;
      }

      products.push({
        cardId: `tcgcsv-${prod.productId || prod.id}`,
        name: prod.name.slice(0, 100),
        market: parseFloat(marketPrice.toFixed(2)),
        priceHistory: [
          { date, price: parseFloat(marketPrice.toFixed(2)), source: 'tcgcsv' }
        ],
        fetchedAt: new Date().toISOString(),
        rarity: prod.rarity || null,
        extendedData: prod.extendedData || null
      });
    });

    if (products.length > 0) {
      const avgPrice = (products.reduce((s, c) => s + c.market, 0) / products.length).toFixed(2);
      log(`      ✓ ${products.length} cards | avg $${avgPrice}`);
    }

    return products;
  } catch (e) {
    log(`    [error] ${e.message.split('\n')[0]}`);
    return products;
  }
}

async function main() {
  log(`[tcgcsv-fetch-cards] ${new Date().toISOString()}`);
  log(`Daily update time: 20:00 UTC\n`);

  let totalSets = 0, totalCards = 0;

  for (const [catId, catInfo] of Object.entries(CATS)) {
    try {
      const dbFile = catInfo.db;
      const db = JSON.parse(readFileSync(dbFile, 'utf8'));
      const sets = db.sets || db;
      const isNested = !!db.sets;

      log(`\n[${catInfo.name}]`);

      // Fetch groups (sets) for this category
      const groupsUrl = `${API}/categories/${catId}/groups`;
      const groups = apiFetch(groupsUrl);

      if (!groups || groups.length === 0) {
        log(`  No groups found`);
        continue;
      }

      log(`  Found ${groups.length} sets in tcgcsv`);
      let catSets = 0, catCards = 0;

      for (const group of groups) {
        const products = await fetchSetProducts(group.groupId, group.name, catInfo.name);

        if (products.length > 0) {
          // Match to DB set or create new
          const setKey = group.name.toLowerCase().replace(/\s+/g, '-');
          const set = sets[setKey] || { name: group.name };

          set.cards = set.cards || {};
          set.cards.fullCardList = [...(set.cards.fullCardList || []), ...products];
          set.cards.fetchedAt = new Date().toISOString();

          if (!sets[setKey]) sets[setKey] = set;

          catCards += products.length;
          catSets++;
          totalCards += products.length;
        }

        // Throttle: avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      }

      const output = isNested ? db : sets;
      writeFileSync(dbFile, JSON.stringify(output, null, 2));

      log(`  ${catSets} sets updated, ${catCards} cards\n`);
      totalSets += catSets;
    } catch (e) {
      log(`  ERROR: ${e.message}`);
    }
  }

  log(`\n[COMPLETE] ${totalSets} sets, ${totalCards} cards`);
  log(`Next update: 20:00 UTC tomorrow\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
