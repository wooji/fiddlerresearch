#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const REF = JSON.parse(readFileSync('tcg-id-reference.json', 'utf8'));
const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];

function matchTcgId(setName, category) {
  const ref = REF[category] || {};

  // Try exact match on common patterns
  for (const [key, id] of Object.entries(ref)) {
    if (setName.includes(key) || key.includes(setName.split(/\s+/)[0])) {
      return id;
    }
  }
  return null;
}

DBs.forEach(dbFile => {
  try {
    const db = JSON.parse(readFileSync(dbFile, 'utf8'));
    const sets = db.sets || db;  // Handle both nested (db.sets) and flat (db) structures
    let patched = 0;
    let isNested = !!db.sets;

    Object.entries(sets).forEach(([key, set]) => {
      if (set.tcgId) return;

      // Determine category
      const cat = set.category || (dbFile.includes('lorcana') ? 'lorcana' : dbFile.includes('one-piece') ? 'one_piece' : dbFile.includes('mtg') ? 'mtg' : 'pokemon');
      const tcgId = matchTcgId(set.label || set.name || set.set_name || key, cat);

      if (tcgId) {
        set.tcgId = tcgId;
        if (!set.cards) {
          set.cards = { fullCardList: [], fetchedAt: null };
        }
        console.log(`✓ ${(set.label || set.name || key).slice(0, 50)}: tcgId=${tcgId}`);
        patched++;
      }
    });

    const output = isNested ? db : sets;  // Write back in original structure
    writeFileSync(dbFile, JSON.stringify(output, null, 2));
    console.log(`  [${dbFile}] ${patched} sets patched\n`);
  } catch (e) {
    console.error(`ERROR ${dbFile}: ${e.message}`);
  }
});
