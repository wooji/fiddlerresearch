#!/usr/bin/env node
import { execSync } from 'child_process';

const sources = {
  'TCGPlayer API': async () => {
    try {
      const resp = execSync(`curl -s "https://api.tcgplayer.com/catalog/products?q=Pikachu&limit=1" --max-time 5`, { encoding: 'utf8' });
      return resp.includes('<!DOCTYPE') ? 'BLOCKED (HTML)' : resp.length > 100 ? 'OK' : 'EMPTY';
    } catch (e) { return `ERROR: ${e.message.split('\n')[0].slice(0, 40)}`; }
  },

  'Cardmarket API': async () => {
    try {
      const resp = execSync(`curl -s "https://www.cardmarket.com/api/v2/products?search=Pikachu" --max-time 5`, { encoding: 'utf8' });
      return resp.includes('<!DOCTYPE') ? 'BLOCKED (HTML)' : resp.length > 100 ? 'OK' : 'EMPTY';
    } catch (e) { return `ERROR: ${e.message.split('\n')[0].slice(0, 40)}`; }
  },

  'Scryfall API (MTG only)': async () => {
    try {
      const resp = execSync(`curl -s "https://api.scryfall.com/cards/search?q=Pikachu" --max-time 5`, { encoding: 'utf8' });
      return resp.includes('error') ? 'NOT_FOUND' : resp.length > 100 ? 'OK' : 'EMPTY';
    } catch (e) { return `ERROR: ${e.message.split('\n')[0].slice(0, 40)}`; }
  },

  'PriceCharting API': async () => {
    try {
      const resp = execSync(`curl -s "https://www.pricecharting.com/api/products?q=Pikachu" --max-time 5`, { encoding: 'utf8' });
      return resp.includes('<!DOCTYPE') ? 'BLOCKED (HTML)' : resp.length > 100 ? 'OK' : 'EMPTY';
    } catch (e) { return `ERROR: ${e.message.split('\n')[0].slice(0, 40)}`; }
  },

  'StockX API': async () => {
    try {
      const resp = execSync(`curl -s "https://api.stockx.com/catalog/search?q=Pikachu" --max-time 5`, { encoding: 'utf8' });
      return resp.includes('<!DOCTYPE') ? 'BLOCKED (HTML)' : resp.length > 100 ? 'OK' : 'EMPTY';
    } catch (e) { return `ERROR: ${e.message.split('\n')[0].slice(0, 40)}`; }
  },

  'eBay API (paid)': 'Requires OAuth token',

  'TCGdb.com': async () => {
    try {
      const resp = execSync(`curl -s "https://www.tcgdb.com/api/cards?q=Pikachu" --max-time 5 2>/dev/null || echo "UNKNOWN"`, { encoding: 'utf8', shell: '/bin/bash' });
      return resp.includes('UNKNOWN') ? 'UNKNOWN_SITE' : 'OK';
    } catch (e) { return `ERROR: ${e.message.split('\n')[0].slice(0, 40)}`; }
  }
};

async function main() {
  console.log('[probe-card-sources] Testing 6 sources...\n');
  for (const [name, test] of Object.entries(sources)) {
    console.log(`${name}:`);
    if (typeof test === 'string') {
      console.log(`  → ${test}\n`);
    } else {
      try {
        const result = await test();
        console.log(`  → ${result}\n`);
      } catch (e) {
        console.log(`  → ERROR: ${e.message.split('\n')[0]}\n`);
      }
    }
  }
}

main();
