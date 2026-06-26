#!/usr/bin/env node
/**
 * backfill-all-dealernetx-v2.mjs
 * Comprehensive enumeration with pagination + category discovery
 * Finds products 1990s → 2025 for all sports + TCG
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DealernetXEnumerator } from './lib/dealernetx-enumerator.mjs';

const ROOT = '.';

const CATEGORIES_MAP = {
  // Will be populated by discoverSportsCategories()
};

const DB_MAPPINGS = {
  // sport → { db, path }
  baseball: { path: join(ROOT, 'card-products-special.json'), sport: 'baseball' },
  basketball: { path: join(ROOT, 'card-products-special.json'), sport: 'basketball' },
  football: { path: join(ROOT, 'card-products-special.json'), sport: 'football' },
  soccer: { path: join(ROOT, 'card-products-special.json'), sport: 'soccer' },
  pokemon: { path: join(ROOT, 'set-history.json'), sport: 'pokemon' },
  mtg: { path: join(ROOT, 'set-history-mtg.json'), sport: 'mtg' },
  lorcana: { path: join(ROOT, 'set-history-lorcana.json'), sport: 'lorcana' },
};

async function loadDb(dbPath) {
  try {
    return JSON.parse(readFileSync(dbPath, 'utf8'));
  } catch {
    return { _meta: { lastUpdated: new Date().toISOString(), version: 1 }, sets: {}, players: {} };
  }
}

async function saveDb(dbPath, db) {
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function extractParallels(name) {
  const parallels = [];
  const patterns = [
    { name: '1/1', pattern: /1\/1|one\s+of\s+one/i },
    { name: '1/5', pattern: /1\/5|one\s+of\s+five/i },
    { name: '1/10', pattern: /1\/10|one\s+of\s+ten/i },
    { name: '1/25', pattern: /1\/25|one\s+of\s+twenty-?five/i },
    { name: 'Gold', pattern: /\bgold\b|#d|limited/i },
    { name: 'Red', pattern: /red\s+parallel|ruby/i },
    { name: 'Black', pattern: /black\s+parallel|ebony/i },
    { name: 'Refractor', pattern: /refractor/i },
  ];
  patterns.forEach(p => {
    if (p.pattern.test(name)) parallels.push(p.name);
  });
  return parallels;
}

function extractSpecialCards(name) {
  const specials = [];
  const patterns = [
    { type: 'autograph', pattern: /\bauto\b|signed|autographed/i },
    { type: 'game_used', pattern: /game.?used|gu|jersey|bat/i },
    { type: 'memorabilia', pattern: /mem|relic|swatch/i },
    { type: 'rookie_auto', pattern: /rookie\s+auto|rc\s+auto/i },
    { type: 'dual_auto', pattern: /dual\s+auto|dual.?signed/i },
  ];
  specials.forEach(p => {
    if (p.pattern.test(name)) specials.push(p.type);
  });
  return specials;
}

function categorizeProduct(name) {
  // Infer category from product name
  if (/baseball|topps.*baseball|mlb|panini.*baseball/i.test(name)) return 'baseball';
  if (/basketball|nba|panini.*basketball|flawless/i.test(name)) return 'basketball';
  if (/football|nfl|panini.*football|national treasures/i.test(name)) return 'football';
  if (/soccer|mls|world cup|champions league|topps.*soccer/i.test(name)) return 'soccer';
  if (/pokemon|pocket monsters|scarlet|violet|sword|shield/i.test(name)) return 'pokemon';
  if (/magic|mtg|lord of the rings|fallout|ravnica/i.test(name)) return 'mtg';
  if (/lorcana|disney lorcana|illumineer/i.test(name)) return 'lorcana';
  return null;
}

async function backfillFromCategory(enumerator, categoryId, categoryName) {
  console.log(`\n[${categoryName}] category ${categoryId} - enumerating all pages...`);

  try {
    const { products, totalCount } = await enumerator.enumerateCategory(categoryId);
    console.log(`[${categoryName}] found ${totalCount} total products`);

    // Group by inferred category
    const byCategory = {};
    for (const product of products) {
      const cat = categorizeProduct(product.name);
      if (!cat) continue;

      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(product);
    }

    // Append to each DB
    for (const [cat, products] of Object.entries(byCategory)) {
      const mapping = DB_MAPPINGS[cat];
      if (!mapping) {
        console.log(`    [${cat}] skipped (no DB mapping)`);
        continue;
      }

      const db = await loadDb(mapping.path);
      if (!db.sets) db.sets = {};

      let added = 0;
      for (const product of products) {
        const setKey = product.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        if (!db.sets[setKey]) {
          db.sets[setKey] = {
            set_name: product.name,
            sport: mapping.sport,
            source: 'dealernetx',
            dealernetx_price: product.price,
            dealernetx_qty: product.qty,
            dealernetx_url: product.url,
            parallels: extractParallels(product.name),
            special_cards: extractSpecialCards(product.name),
            fetched_date: new Date().toISOString(),
          };
          added++;
        }
      }

      db._meta = db._meta || {};
      db._meta.lastUpdated = new Date().toISOString();
      await saveDb(mapping.path, db);
      console.log(`    [${cat}] added ${added} products to ${mapping.path}`);
    }
  } catch (e) {
    console.error(`[${categoryName}] error:`, e.message);
  }
}

async function main() {
  console.log('[backfill-v2] discovering DealernetX sports categories...');
  const enumerator = new DealernetXEnumerator();

  try {
    const categories = await enumerator.discoverSportsCategories();
    console.log(`[backfill-v2] discovered categories:`, Object.values(categories).map(c => c.name).join(', '));

    let totalProducts = 0;
    for (const [catId, catInfo] of Object.entries(categories)) {
      const count = await backfillFromCategory(enumerator, catId, catInfo.name);
      totalProducts += count || 0;
    }

    console.log(`\n[backfill-v2] complete - enumerated all DealernetX sports + TCG categories`);
    console.log('[backfill-v2] all databases updated with comprehensive pricing + product data');
  } catch (e) {
    console.error('[backfill-v2] fatal:', e);
  }

  process.exit(0);
}

main();
