#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];

function tcgSearch(setName) {
  try {
    // Search TCGPlayer API for set ID
    const json = execSync(`curl -s "https://api.tcgplayer.com/catalog/products?q=${encodeURIComponent(setName)}&limit=1" -A "Mozilla/5.0"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 8000
    });
    const data = JSON.parse(json);
    if (data.results && data.results.length > 0) {
      return data.results[0].productId || data.results[0].id;
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function main() {
  console.log('[tcg-lookup-ids] Starting tcgId population...\n');

  DBs.forEach(dbFile => {
    try {
      const db = JSON.parse(readFileSync(dbFile, 'utf8'));
      const sets = db.sets || db;
      let found = 0, missing = 0;
      
      Object.entries(sets).forEach(([setKey, set]) => {
        if (set.tcgId) {
          found++;
          return;
        }
        
        const setName = set.label || set.set_name || setKey;
        const tcgId = tcgSearch(setName);
        
        if (tcgId) {
          set.tcgId = tcgId;
          console.log(`✓ ${setName.slice(0, 50)}: tcgId=${tcgId}`);
        } else {
          missing++;
          console.log(`✗ ${setName.slice(0, 50)}: NOT FOUND`);
        }
      });
      
      writeFileSync(dbFile, JSON.stringify(db, null, 2));
      console.log(`\n[${dbFile}] ${found} had tcgId, ${missing} looked up\n`);
    } catch (e) {
      console.error(`ERROR ${dbFile}:`, e.message);
    }
  });
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
