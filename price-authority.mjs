#!/usr/bin/env node
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const PIPELINE = JSON.parse(readFileSync('pipeline-results.json', 'utf8'));

function tcgPlayerCards(productId) {
  try {
    const json = execSync(`curl -s "https://api.tcgplayer.com/catalog/products/${productId}/skus" -H "User-Agent: Mozilla/5.0"`, {
      encoding: 'utf8', timeout: 10000
    });
    const data = JSON.parse(json);
    
    if (!data.results) return [];
    
    return data.results
      .sort((a, b) => (b.marketPrice || 0) - (a.marketPrice || 0))
      .slice(0, 10)
      .map(card => ({
        name: card.productName || 'Unknown',
        price: card.marketPrice || 0
      }));
  } catch (e) {
    return [];
  }
}

function main() {
  const prod = PIPELINE;
  console.log(`\n=== PRICE AUTHORITY: ${prod.label} ===`);
  console.log(`Category: ${prod.category}`);
  console.log(`Sealed Market: ${prod.pricing.market.data}`);
  
  const retailMatch = prod.pricing.internalDb.data.match(/\$([0-9.]+)/);
  const retail = retailMatch ? parseFloat(retailMatch[1]) : null;
  console.log(`Retail: $${retail || 'N/A'}`);
  console.log(`Rating: ${prod.rating}`);
  
  if (prod.tcgId && (prod.category === 'pokemon' || prod.category === 'mtg' || prod.category === 'lorcana')) {
    console.log(`\nFetching Top 10 Chase Cards...`);
    const cards = tcgPlayerCards(prod.tcgId);
    
    if (cards.length > 0) {
      let totalChaseValue = 0;
      cards.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.name.slice(0, 50)}: $${c.price.toFixed(2)}`);
        totalChaseValue += c.price;
      });
      
      const avgChasePrice = (totalChaseValue / cards.length).toFixed(2);
      const sealedPrice = parseFloat(prod.pricing.market.data.match(/\$([0-9.]+)/)?.[1]) || 0;
      
      console.log(`\n📊 Price Authority:`);
      console.log(`  Sealed EV: $${sealedPrice.toFixed(2)}`);
      console.log(`  Avg Chase Card: $${avgChasePrice}`);
      console.log(`  Top 10 Chase Total: $${totalChaseValue.toFixed(2)}`);
      console.log(`  Verdict: ${sealedPrice > totalChaseValue ? '🟢 Hold sealed (closed, limited upside crack)' : '🔴 Crack singles (chase cards > sealed)'}`);
    } else {
      console.log('  (No card data found)');
    }
  }
}

main();
