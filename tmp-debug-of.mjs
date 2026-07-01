import { execFileSync } from 'child_process';

const r = execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0',
  'https://www.pricecharting.com/game/pokemon-obsidian-flames/obsidian-flames-super-premium-collection-box'
], { encoding: 'utf8' });

console.log('len:', r.length);
console.log('has id=used_price:', r.includes('id="used_price"'));
console.log('tbody count:', (r.match(/<tbody>/g) ?? []).length);
console.log('product rows:', (r.match(/<tr id="product-/g) ?? []).length);

// Show first product row price
const tbIdx = r.indexOf('<tbody>');
const slice = r.slice(tbIdx, tbIdx + 2000);

// Extract first js-price
const prices = [...slice.matchAll(/class="js-price">([^<]+)/g)].map(m => m[1].trim());
console.log('first prices:', prices.slice(0, 5).join(', '));

// Is this a search-results/list page or a single product page?
// Single product pages have id="used_price" and id="new_price"
// List pages have product rows
console.log('\nPage type: ', r.includes('id="used_price"') ? 'SINGLE PRODUCT' : 'LIST/SEARCH');
