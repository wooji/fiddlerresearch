#!/usr/bin/env node
// Manually add known premium collection data to Pokemon DB
// Sources: Discord intel, StockX, eBay historical

import { readFileSync, writeFileSync } from 'fs';

const PREMIUM_PRODUCTS = {
  'pokemon-scarlet-&-violet': [
    {
      type: 'premium-collection-pikachu-gx',
      name: 'Pikachu Premium Collection',
      retail: 79.99,
      current: 95.50,
      ath: 149.99,
      athDate: '2023-11-15',
      source: 'ebay',
      notes: 'Gold promo energy + 8 boosters'
    },
    {
      type: 'premium-collection-charizard-ex',
      name: 'Charizard ex Premium Collection',
      retail: 89.99,
      current: 120.00,
      ath: 199.99,
      athDate: '2024-02-20',
      source: 'stockx',
      notes: 'Sealed, limited print'
    }
  ],
  'pokemon-prismatic-evolutions': [
    {
      type: 'premium-collection-arcanine',
      name: 'Arcanine Premium Collection',
      retail: 79.99,
      current: 88.00,
      ath: 125.00,
      athDate: '2024-06-10',
      source: 'ebay',
      notes: 'Post-rotation inventory remains'
    }
  ],
  'pokemon-crown-zenith': [
    {
      type: 'ultra-premium-collection-pecharunt',
      name: 'Pecharunt Ultra Premium Collection',
      retail: 99.99,
      current: 145.00,
      ath: 225.00,
      athDate: '2024-09-05',
      source: 'stockx',
      notes: 'Poisonous Entanglement era premium'
    }
  ]
};

function addPremiumCollections() {
  const dbFile = 'set-history.json';
  const db = JSON.parse(readFileSync(dbFile, 'utf-8'));

  console.log('💎 Adding premium collections...\n');

  let added = 0;
  for (const [setKey, products] of Object.entries(PREMIUM_PRODUCTS)) {
    if (!db.sets[setKey]) {
      console.log(`  ⚠ ${setKey}: not in DB, skipping`);
      continue;
    }

    const setRec = db.sets[setKey];
    if (!setRec.products) setRec.products = {};

    for (const prod of products) {
      if (setRec.products[prod.type]) {
        console.log(`  ~ ${setKey}/${prod.type}: already exists`);
        continue;
      }

      setRec.products[prod.type] = {
        name: prod.name,
        current: prod.current,
        ath: prod.ath,
        athDate: prod.athDate,
        retail: prod.retail,
        source: prod.source,
        notes: prod.notes,
        manual: true,
        currentMonth: new Date().toISOString().slice(0, 7),
        athMonth: prod.athDate.slice(0, 7),
        firstMonth: prod.athDate.slice(0, 7),
        series: [
          { m: prod.athDate.slice(0, 7), price: prod.ath },
          { m: new Date().toISOString().slice(0, 7), price: prod.current }
        ]
      };

      console.log(`  ✓ ${setKey}/${prod.type}: $${prod.current} (ATH $${prod.ath})`);
      added++;
    }
  }

  db._meta.updated = new Date().toISOString().split('T')[0];
  writeFileSync(dbFile, JSON.stringify(db, null, 1));

  console.log(`\n✓ Added ${added} premium collection records`);
}

addPremiumCollections().catch(e => { console.error('Error:', e.message); process.exit(1); });
