// Fetch TCGPlayer catalog API for AH sealed products to get product IDs + images
const r = await fetch('https://api.tcgplayer.com/catalog/products?categoryId=3&groupId=0&productName=ascended+heroes&productTypes=Sealed+Products&limit=20&offset=0', {
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0'
  }
});
const j = await r.json();
console.log('STATUS:', r.status);
console.log(JSON.stringify(j).slice(0, 500));

// Try TCGPlayer search API
const r2 = await fetch('https://mp-search-api.tcgplayer.com/v1/search/request?q=ascended+heroes&isFuzzy=false&channel=desktop&minMsrpRange=0&maxMsrpRange=9999&categoryId=3&subTypeName=Sealed+Products&limit=10&offset=0&sort=&productLineName=pokemon', {
  headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
});
const j2 = await r2.json();
console.log('\nSEARCH API STATUS:', r2.status);
const results = j2?.results?.[0]?.results || [];
results.forEach(r => {
  console.log('ID:', r.productId, '| NAME:', r.productName?.slice(0, 60));
  console.log('  MARKET:', r.marketPrice, '| IMG ID:', r.imageUrl?.slice(0, 80));
});
