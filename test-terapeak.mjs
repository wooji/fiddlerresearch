const APP_ID = 'CNGVentu-Research-PRD-8a92c9933-cabfbfe9';
const SECRET = 'PRD-a92c9933da37-dab1-4343-a515-4ca6';
const creds = Buffer.from(`${APP_ID}:${SECRET}`).toString('base64');

// Get base token first
const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
  method: 'POST',
  headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
});
const tj = await tokenRes.json();
const token = tj.access_token;
console.log('Token:', token ? 'OK' : 'FAIL', '| Scope:', tj.scope?.slice(0, 80));

// Test Marketplace Insights (Terapeak) — category 183454 = Pokemon TCG
const r = await fetch(
  'https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?q=Pokemon+Ascended+Heroes+Elite+Trainer+Box&category_ids=183454&limit=20',
  { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY-US' } }
);
const j = await r.json();
console.log('\nInsights STATUS:', r.status);

if (j.itemSales?.length) {
  const prices = j.itemSales.map(i => parseFloat(i.lastSoldPrice?.value || 0)).filter(p => p > 50);
  const sorted = [...prices].sort((a,b) => a-b);
  const avg = (prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2);
  console.log(`Sold count: ${prices.length} | Avg: $${avg} | Low: $${sorted[0]} | High: $${sorted.at(-1)}`);
  j.itemSales.slice(0, 10).forEach(i => {
    const price = i.lastSoldPrice?.value;
    const date = i.lastSoldDate?.slice(0, 10);
    const title = i.title?.slice(0, 65);
    console.log(`  $${price} | ${date} | ${title}`);
  });
} else {
  console.log(JSON.stringify(j).slice(0, 500));
}
