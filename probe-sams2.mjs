import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: false, slowMo: 100 }); // headful to bypass bot detect
const page = await browser.newPage();
await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

console.log('=== SAMS: heavy hitters ===');
await page.goto('https://www.samsclub.com/search?searchTerm=pokemon+heavy+hitters', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(5000);

const items = await page.evaluate(() => {
  const cards = [];
  document.querySelectorAll('[class*="productTile"], [data-sc-v2="true"], [class*="product-card"]').forEach(card => {
    const name = card.querySelector('[class*="productTitle"], [class*="title"]')?.textContent?.trim();
    const price = card.querySelector('[class*="price"]')?.textContent?.trim();
    const img = card.querySelector('img')?.src;
    const link = card.querySelector('a')?.href;
    if (name) cards.push({ name: name.slice(0, 80), price: price?.slice(0, 30), img: img?.slice(0, 120), link: link?.slice(0, 100) });
  });
  return cards;
});

if (items.length) {
  items.forEach(i => console.log(i.name, '|', i.price, '\n  IMG:', i.img, '\n  LINK:', i.link));
} else {
  const bodyText = await page.evaluate(() => document.body.innerText?.slice(0, 1000));
  console.log(bodyText?.slice(0, 600));
  // Get all images
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll('img')].map(i => ({ src: i.src?.slice(0, 100), alt: i.alt?.slice(0, 60) })).filter(i => i.src && !i.src.includes('svg')).slice(0, 8)
  );
  imgs.forEach(i => console.log('IMG:', i.alt, '|', i.src));
}

// Also search broader
console.log('\n=== SAMS: ascended heroes ===');
await page.goto('https://www.samsclub.com/search?searchTerm=ascended+heroes', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(4000);
const text2 = await page.evaluate(() => document.body.innerText?.slice(0, 800));
console.log(text2?.slice(0, 500));

await browser.close();
