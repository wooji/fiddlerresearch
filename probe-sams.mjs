import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Sam's Club search for AH Heavy Hitters
console.log('=== SAMS: ascended heroes heavy hitters ===');
await page.goto('https://www.samsclub.com/s/ascended%20heroes', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(4000);
const samsItems = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('[class*="product"], [data-item]').forEach(el => {
    const name = el.querySelector('[class*="productName"], [class*="title"], h3, h4')?.textContent?.trim();
    const price = el.querySelector('[class*="price"]')?.textContent?.trim();
    const img = el.querySelector('img')?.src;
    const link = el.querySelector('a')?.href;
    if (name && name.length > 4) items.push({ name: name.slice(0, 80), price, img: img?.slice(0, 120), link: link?.slice(0, 100) });
  });
  return items.slice(0, 8);
});
if (samsItems.length) {
  samsItems.forEach(i => console.log(i.name, '|', i.price, '\n  IMG:', i.img, '\n  LINK:', i.link));
} else {
  const text = await page.evaluate(() => document.body.innerText?.slice(0, 800));
  console.log(text?.slice(0, 500));
  // Try getting product JSON from page
  const json = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    return scripts.map(s => s.textContent?.slice(0, 300)).filter(Boolean);
  });
  if (json.length) console.log('JSON-LD:', json[0]);
}

// Also check Sam's with broader Pokemon search
console.log('\n=== SAMS: pokemon pokemon center ===');
await page.goto('https://www.samsclub.com/s/pokemon%20heavy%20hitters', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const samsItems2 = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('[class*="product-title"], [class*="ProductTitle"]').forEach(el => {
    items.push(el.textContent?.trim()?.slice(0, 80));
  });
  return items;
});
samsItems2.forEach(i => console.log(i));

// Direct Sam's Club product search via API
console.log('\n=== SAMS API: heavy hitters ===');
const r = await fetch('https://www.samsclub.com/api/node/vivaldi/v2/products/search?sourceType=1&q=pokemon+heavy+hitters&clubId=4735&offset=0&limit=12', {
  headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
});
if (r.ok) {
  const d = await r.json();
  const prods = d?.payload?.records || d?.records || [];
  prods.slice(0, 5).forEach(p => {
    const name = p.raw?.['ec_name'] || p.name;
    const price = p.raw?.['ec_price'] || p.price;
    const img = p.raw?.['ec_images']?.[0] || p.thumbnailImage;
    const itemNum = p.raw?.['ec_item_number'] || p.itemId;
    console.log(name?.slice(0, 70), '|', price, '| ITEM:', itemNum, '\n  IMG:', img?.slice(0, 100));
  });
} else {
  console.log('API err:', r.status);
}

await browser.close();
