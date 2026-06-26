// Fetch TCGPlayer live pricing for AH products via intercepted API pattern
const products = [
  { id: 668496, name: 'AH ETB (Standard)' },
  { id: 668497, name: 'AH ETB (PC Exclusive)' },
  { id: 668541, name: 'AH Booster Bundle' },
];

for (const p of products) {
  // Use the details endpoint (no auth needed — public API)
  const r1 = await fetch(`https://mp-search-api.tcgplayer.com/v2/product/${p.id}/details`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.tcgplayer.com/' }
  });
  const d1 = await r1.json();

  // Use the SKU market price endpoint
  const r2 = await fetch(`https://mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Referer': 'https://www.tcgplayer.com/', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ productIds: [p.id] })
  });
  const d2 = r2.ok ? await r2.json() : null;

  console.log(`\n${p.name} (${p.id}):`);
  console.log('  marketPrice:', d1.marketPrice ?? d1.market_price);
  console.log('  lowestListing:', d1.lowestListing ?? d1.lowest_listing);
  if (d2) console.log('  SKU data:', JSON.stringify(d2).slice(0, 200));
}
