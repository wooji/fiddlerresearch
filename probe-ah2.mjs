import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Target search for all Ascended Heroes products
console.log('=== TARGET SEARCH: ascended heroes ===');
await page.goto('https://www.target.com/s?searchTerm=pokemon+ascended+heroes', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(4000);

const targetItems = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('[data-test="product-details"]').forEach(el => {
    const name = el.querySelector('a[data-test="product-title"]')?.textContent?.trim();
    const price = el.querySelector('[data-test="current-price"]')?.textContent?.trim();
    const img = el.closest('[data-test="product-card"]')?.querySelector('img')?.src;
    if (name) items.push({ name: name.slice(0, 80), price, img: img?.slice(0, 120) });
  });
  return items;
});

if (targetItems.length) {
  targetItems.forEach(i => console.log(i.name, '|', i.price, '\n  IMG:', i.img));
} else {
  const text = await page.evaluate(() => document.body.innerText?.slice(0, 800));
  console.log(text?.slice(0, 400));
}

// Walmart search
console.log('\n=== WALMART SEARCH: ascended heroes ===');
await page.goto('https://www.walmart.com/search?q=pokemon+ascended+heroes+elite+trainer', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const wHTML = await page.content();
const wImgs = [...wHTML.matchAll(/https:\/\/i5\.walmartimages\.com\/[^\s"']+\.(?:jpg|png|webp)/g)];
const wTitles = [...wHTML.matchAll(/"name"\s*:\s*"([^"]{10,80})"/g)].filter(m => /pokemon|ascend|mega/i.test(m[1]));
wTitles.slice(0, 8).forEach(m => console.log('WM:', m[1]));
wImgs.slice(0, 4).forEach(m => console.log('WM IMG:', m[0].slice(0, 110)));

// TCGPlayer direct product pages for Ascended Heroes sealed products
console.log('\n=== TCGPLAYER DIRECT: ascended heroes sealed ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/mega-evolution-ascended-heroes?productLineName=pokemon&q=elite+trainer&view=grid', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const tcgText = await page.evaluate(() => document.body.innerText?.slice(0, 1200));
console.log(tcgText?.slice(0, 600));

// Try Pokemon Center for AH ETB
console.log('\n=== POKEMON CENTER: AH ETB probe ===');
const ahSkus = [
  '10-10399-101', // chaos rising ETB (known)
  '10-10379-101', // guess for AH ETB
  '10-10385-101',
  '10-10389-101',
  '10-10391-101',
];
for (const sku of ahSkus) {
  const r = await fetch(`https://www.pokemoncenter.com/en-us/product/${sku}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (r.url.includes(sku)) {
    console.log(sku, ':', r.status, r.url.slice(0, 80));
  }
}

await browser.close();
