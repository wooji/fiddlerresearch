#!/usr/bin/env node
/**
 * backfill-card-products.mjs
 * Populate card-products-special.json from DealernetX (primary) + PriceCharting (cross-ref)
 * Replaces hardcoded product data with live market intel
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DealernetXSportsScraper } from './lib/dealernetx-sports-scraper.mjs';

const ROOT = '.';
const PRODUCTS_DB_PATH = join(ROOT, 'card-products-special.json');

async function backfillCardProducts() {
  console.log('[backfill-cards] scraping DealernetX sports card products...');

  const scraper = new DealernetXSportsScraper();
  const productsDb = {
    _meta: {
      db: 'card-products-special',
      description: 'Sports card products: parallels, autos, inserts, pricing from DealernetX + PriceCharting',
      lastUpdated: new Date().toISOString(),
      version: 1,
      sources: ['dealernetx', 'pricecharting'],
    },
    sets: {},
  };

  const sports = ['baseball', 'basketball', 'football'];

  for (const sport of sports) {
    console.log(`  [${sport}] fetching products...`);

    try {
      const products = await scraper.scrapeProductsByCategory(sport);
      console.log(`  [${sport}] found ${products.length} products`);

      for (const product of products) {
        // Enrich with PriceCharting data
        const enriched = await scraper.enrichWithPriceCharting(product);

        // Normalize set key: "2024 Topps Chrome Baseball" → "2024-topps-chrome-baseball"
        const setKey = enriched.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        if (!productsDb.sets[setKey]) {
          productsDb.sets[setKey] = {
            set_name: enriched.name,
            sport,
            year: enriched.year,
            brand: enriched.brand,
            source: 'dealernetx',
            dealernetx_price: enriched.price,
            dealernetx_quantity: enriched.quantity_available,
            pricecharting: enriched.pricecharting,
            parallels: enriched.parallels,
            special_cards: enriched.special_cards,
            fetched_date: enriched.fetched_date,
          };
        }
      }
    } catch (e) {
      console.error(`  [${sport}] error:`, e.message);
    }
  }

  writeFileSync(PRODUCTS_DB_PATH, JSON.stringify(productsDb, null, 2));
  console.log(`[backfill-cards] saved ${Object.keys(productsDb.sets).length} sets to ${PRODUCTS_DB_PATH}`);
  console.log('[backfill-cards] done - DealernetX products enriched with PriceCharting cross-ref');
}

async function main() {
  try {
    await backfillCardProducts();
    process.exit(0);
  } catch (e) {
    console.error('[backfill-cards] fatal:', e);
    process.exit(1);
  }
}

main();
