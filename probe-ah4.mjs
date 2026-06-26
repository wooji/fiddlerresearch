import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// TCGPlayer page 2 for more AH products (display tins, poster collection, etc.)
console.log('=== TCGPLAYER AH - more products (p2) ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/mega-evolution-ascended-heroes?view=grid&page=2', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(3500);
const p2 = await page.evaluate(() => document.body.innerText);
console.log(p2.slice(0, 3000));

// TCGPlayer search for "ascended heroes tin"
console.log('\n=== TCGPLAYER: ascended heroes tin ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/product?q=ascended+heroes+tin&view=grid', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const tinText = await page.evaluate(() => document.body.innerText?.slice(0, 1500));
console.log(tinText?.slice(0, 800));

// TCGPlayer search for "ascended heroes poster"
console.log('\n=== TCGPLAYER: ascended heroes poster ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/product?q=ascended+heroes+poster&view=grid', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const posterText = await page.evaluate(() => document.body.innerText?.slice(0, 1500));
console.log(posterText?.slice(0, 800));

// Target Redsky API for all AH products
console.log('\n=== TARGET REDSKY: ascended heroes ===');
await page.goto('https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?keyword=ascended+heroes&channel=WEB&count=24&default_purchasability_filter=true&offset=0&platform=desktop&pricing_store_id=1374&store_ids=1374&visitor_id=018FAA0', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(2000);
const rdskyRaw = await page.evaluate(() => document.body.innerText);
// Parse JSON
try {
  const data = JSON.parse(rdskyRaw);
  const items = data?.data?.search?.products || [];
  items.forEach(p => {
    const item = p?.item;
    const tcin = item?.tcin;
    const title = item?.product_description?.title;
    const price = item?.price?.current_retail;
    const img = item?.enrichment?.images?.primary_image_url;
    console.log(`${tcin} | ${price} | ${title?.slice(0, 60)}`);
    console.log(`  IMG: ${img?.slice(0, 100)}`);
  });
} catch(e) {
  console.log(rdskyRaw.slice(0, 500));
}

await browser.close();
