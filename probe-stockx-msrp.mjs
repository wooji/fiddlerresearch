#!/usr/bin/env node
// Batch StockX MSRP lookup for all pipeline products
import { stockxMarket } from './lib/stockx.mjs';

const PRODUCTS = [
  // Pokemon
  { key: 'pe-spc',  q: 'Prismatic Evolutions Super Premium Collection Pokemon', cat: 'pokemon' },
  { key: 'pe-etb',  q: 'Prismatic Evolutions Elite Trainer Box Pokemon',         cat: 'pokemon' },
  { key: 'pb-bb',   q: 'Surging Sparks Booster Box Pokemon',                     cat: 'pokemon' },
  { key: 'sv9-etb', q: 'Journey Together Elite Trainer Box Pokemon',              cat: 'pokemon' },
  { key: 'sv9-bb',  q: 'Journey Together Booster Box Pokemon',                   cat: 'pokemon' },
  { key: 'me04-etb', q: 'Mega Blaziken ex Premium Collection Pokemon',           cat: 'pokemon' },
  { key: 'me05-etb', q: 'Mega Charizard X ex Ultra Premium Collection Pokemon',  cat: 'pokemon' },
  // MTG
  { key: 'stx-cbb', q: 'Secrets of Strixhaven Collector Booster Box MTG',        cat: 'mtg' },
  { key: 'fin-cbb', q: 'Final Fantasy Collector Booster Box MTG',                cat: 'mtg' },
  // Lorcana
  { key: 'aotv-bb', q: 'Disney Lorcana Attack of the Vine Booster Box',          cat: 'lorcana' },
  { key: 'itr-bb',  q: "Disney Lorcana Illumineer's Trove Booster Box",          cat: 'lorcana' },
  // One Piece
  { key: 'op10-bb', q: 'One Piece TCG OP-10 Royal Blood Booster Box',            cat: 'one_piece' },
  { key: 'op12-bb', q: 'One Piece TCG OP-12 Booster Box',                        cat: 'one_piece' },
  { key: 'eb05',    q: 'One Piece TCG EB-05 Booster Box',                        cat: 'one_piece' },
  { key: 'op13-bb', q: 'One Piece TCG OP-13 Booster Box',                        cat: 'one_piece' },
  // Topps
  { key: 'topps-chrome-bb-26',  q: '2026 Topps Chrome Baseball Hobby Box',        cat: 'topps' },
  { key: 'topps-series1-26-hb', q: '2026 Topps Series 1 Baseball Hobby Box',      cat: 'topps' },
  { key: 'topps-chrome-nba-26', q: '2025-26 Topps Chrome Basketball Hobby Box',   cat: 'topps' },
];

console.log(`[stockx-msrp] Querying ${PRODUCTS.length} products...\n`);

const results = {};
for (const prod of PRODUCTS) {
  try {
    const res = await stockxMarket(prod.q, prod.cat === 'topps' ? 'sports' : prod.cat);
    const msrp   = res?.msrp
                ?? res?.productAttributes?.retailPrice
                ?? res?.attributes?.retailPrice
                ?? null;
    const market = res?.lastSale ?? res?.market ?? res?.last ?? null;
    const urlKey = res?.urlKey ?? res?.slug ?? null;
    console.log(`  ${prod.key}: MSRP=$${msrp ?? 'null'}  market=$${market ?? 'null'}  urlKey=${urlKey ?? '—'}`);
    if (res && !msrp) {
      console.log(`    raw keys: ${Object.keys(res).join(', ')}`);
      if (res.productAttributes) console.log(`    productAttributes: ${JSON.stringify(res.productAttributes).slice(0, 200)}`);
    }
    results[prod.key] = { msrp, market, urlKey };
  } catch (e) {
    console.log(`  ${prod.key}: ERR ${e.message.slice(0, 80)}`);
    results[prod.key] = { err: e.message.slice(0, 80) };
  }
}

console.log('\n=== MSRP SUMMARY ===');
Object.entries(results).forEach(([k,v]) => {
  if (v.msrp) console.log(`  ✅ ${k}: $${v.msrp}`);
  else console.log(`  ❌ ${k}: no MSRP (market=${v.market ?? 'null'})`);
});
