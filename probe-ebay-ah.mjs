// eBay Finding API was sunset Oct 2024. Use OAuth client credentials + Browse API.
const APP_ID = 'CNGVentu-Research-PRD-8a92c9933-cabfbfe9';

// Step 1: get OAuth token (client_credentials — no user login needed for Browse API)
// Need client_secret — derive from developer.ebay.com My API Keys → Production → Client Secret
// For now probe what we can from the Buy Browse API with just App ID as a guest
const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': 'Basic ' + Buffer.from(`${APP_ID}:`).toString('base64'),
  },
  body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
});
const tokenJson = await tokenRes.json();
console.log('Token response:', tokenRes.status, JSON.stringify(tokenJson).slice(0, 300));

if (tokenJson.access_token) {
  const token = tokenJson.access_token;
  // Browse API: search for AH ETB
  const browseRes = await fetch(
    'https://api.ebay.com/buy/browse/v1/item_summary/search?q=Pokemon+Ascended+Heroes+Elite+Trainer+Box&filter=buyingOptions%3A%7BFIXED_PRICE%7D&limit=10',
    { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAYS-MOTORS-US' } }
  );
  const browseJson = await browseRes.json();
  console.log('Browse status:', browseRes.status);
  console.log(JSON.stringify(browseJson).slice(0, 500));
}
