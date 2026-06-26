import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// TCGPlayer search for Ascended Heroes - all sealed products
console.log('=== TCGPLAYER: ascended heroes ALL products ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/product?q=ascended+heroes&view=grid', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(4000);
const tcgRaw = await page.evaluate(() => document.body.innerText);
console.log(tcgRaw.slice(0, 2000));

// Target - first search result grabbed as JSON
console.log('\n=== TARGET: ascended heroes products ===');
await page.goto('https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?keyword=pokemon+ascended+heroes&channel=WEB&count=24&default_purchasability_filter=true&include_sponsored=true&offset=0&platform=desktop&pricing_store_id=1374&scheduled_delivery_store_id=1374&store_ids=1374&useragent=Mozilla&visitor_id=018FAA', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(2000);
const rdskyText = await page.evaluate(() => document.body.innerText?.slice(0, 3000));
console.log(rdskyText?.slice(0, 2000));

await browser.close();
