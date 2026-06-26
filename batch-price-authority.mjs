#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Get all results from each category DB
const DBs = ['set-history.json', 'set-history-mtg.json', 'set-history-lorcana.json', 'set-history-one-piece.json'];
const authority = {};

function tcgCards(productId) {
  try {
    const json = execSync(`curl -s "https://api.tcgplayer.com/catalog/products/${productId}/skus" --max-time 8`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    });
    const data = JSON.parse(json);
    if (!data.results) return [];
    
    return data.results
      .sort((a, b) => (b.marketPrice || 0) - (a.marketPrice || 0))
      .slice(0, 10)
      .reduce((sum, c) => sum + (c.marketPrice || 0), 0);
  } catch { return 0; }
}

DBs.forEach(dbFile => {
  try {
    const db = JSON.parse(readFileSync(dbFile, 'utf8'));
    const sets = db.sets || db;
    
    Object.entries(sets).forEach(([k, v]) => {
      if (!v.label || !v.market) return;
      
      const sealedPrice = parseFloat(v.market.match(/\$([0-9.]+)/)?.[1]) || 0;
      const chaseTotal = v.tcgId ? tcgCards(v.tcgId) : 0;
      
      authority[k] = {
        label: v.label.slice(0, 50),
        category: v.category,
        sealed: sealedPrice,
        chaseTotal: chaseTotal,
        verdict: sealedPrice > chaseTotal ? 'HOLD sealed' : 'CRACK singles'
      };
    });
  } catch (e) {}
});

writeFileSync('price-authority-report.json', JSON.stringify(authority, null, 2));
console.log(`✓ Price authority built: ${Object.keys(authority).length} sealed products`);
console.log('\nTop findings:');
Object.entries(authority).slice(0, 5).forEach(([k, v]) => {
  console.log(`  ${v.label}: sealed $${v.sealed} vs chase $${v.chaseTotal} → ${v.verdict}`);
});
