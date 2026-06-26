const APP_ID = 'CNGVentu-Research-PRD-8a92c9933-cabfbfe9';
const SECRET = 'PRD-a92c9933da37-dab1-4343-a515-4ca6';

const creds = Buffer.from(`${APP_ID}:${SECRET}`).toString('base64');

const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${creds}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
});

const j = await r.json();
console.log('STATUS:', r.status);
console.log(JSON.stringify(j).slice(0, 300));

if (j.access_token) {
  // Test Browse API — search AH ETB sold
  const browse = await fetch(
    'https://api.ebay.com/buy/browse/v1/item_summary/search?q=Pokemon+Ascended+Heroes+Elite+Trainer+Box&filter=buyingOptions%3A%7BFIXED_PRICE%7D&limit=5',
    {
      headers: {
        'Authorization': `Bearer ${j.access_token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY-US',
      }
    }
  );
  const bj = await browse.json();
  console.log('\nBROWSE STATUS:', browse.status);
  (bj.itemSummaries || []).slice(0, 3).forEach(i => {
    console.log(i.title?.slice(0, 60), '|', i.price?.value, i.price?.currency);
  });
}
