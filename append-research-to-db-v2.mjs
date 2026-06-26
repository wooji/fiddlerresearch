#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = '.';
const PIPELINE_RESULTS = join(ROOT, 'pipeline-results.json');
const CAT_DB_MAP = {
  pokemon: 'set-history.json',
  mtg: 'set-history-mtg.json',
  lorcana: 'set-history-lorcana.json',
  sports: 'set-history-sports.json',
  topps: 'set-history-sports.json',
  other_tcg: 'set-history-other-tcg.json',
  one_piece: 'set-history-one-piece.json',
  lego: 'set-history-lego.json',
  noncard: 'set-history-noncard.json',
  mattel: 'set-history-noncard.json'
};

function appendToDb(prod) {
  if (!prod.category || !CAT_DB_MAP[prod.category]) return;
  
  const dbFile = join(ROOT, CAT_DB_MAP[prod.category]);
  try {
    const db = JSON.parse(readFileSync(dbFile, 'utf8'));
    const key = prod.key || prod.label;
    
    // Handle nested sets structure OR flat structure
    const target = db.sets || db;
    if (!target[key]) {
      target[key] = {
        label: prod.label,
        category: prod.category,
        retail: prod.pricing?.internalDb?.data?.match(/\$([0-9.]+)/)?.[1],
        market: prod.pricing?.market?.data,
        rating: prod.rating,
        writeup: prod.writeup || {},
        dated: new Date().toISOString()
      };
      writeFileSync(dbFile, JSON.stringify(db, null, 2));
      console.log(`  ✓ ${key} → ${CAT_DB_MAP[prod.category]}`);
    }
  } catch (e) {
    console.error(`  ✗ ${prod.key}: ${e.message}`);
  }
}

async function main() {
  console.log('[append-v2] processing pipeline results...');
  
  try {
    const results = JSON.parse(readFileSync(PIPELINE_RESULTS, 'utf8'));
    
    // Handle both array and single object format
    const products = Array.isArray(results) ? results : [results];
    
    console.log(`[append] ${products.length} product(s)`);
    products.forEach(p => appendToDb(p));
    
    console.log('[append] COMPLETE');
  } catch (e) {
    console.error('[append] ERROR:', e.message);
  }
}

main();
