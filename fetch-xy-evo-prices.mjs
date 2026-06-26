/**
 * Fetch XY Evolutions current pricing from TCGPlayer
 */

const products = [
  { name: 'XY Evolutions ETB (Mega)', id: 123448 },
  { name: 'XY Evolutions Booster Box', id: 123446 },
  { name: 'XY Evolutions Booster Pack', id: 129907 },
];

for (const p of products) {
  try {
    const r = await fetch(`https://mp-search-api.tcgplayer.com/v2/product/${p.id}/details`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.tcgplayer.com/',
      },
    });
    if (r.ok) {
      const data = await r.json();
      const result = data?.result?.[0] ?? data;
      console.log(`\n${p.name}:`);
      console.log(`  Market: $${result.marketPrice ?? 'N/A'}`);
      console.log(`  Low: $${result.lowestListingPrice ?? 'N/A'}`);
      console.log(`  High: $${result.highestListingPrice ?? 'N/A'}`);
      console.log(`  Sales: ${result.numberOfSales ?? 'N/A'}`);
      console.log(`  Product URL: https://www.tcgplayer.com/product/${p.id}`);
    } else {
      console.log(`${p.name}: API error ${r.status}`);
    }
  } catch (e) {
    console.log(`${p.name}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 500));
}
