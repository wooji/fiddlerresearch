import { chromium } from 'playwright';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// TCGPlayer - search for all Ascended Heroes products
console.log('=== TCGPLAYER ASCENDED HEROES ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/product?q=ascended+heroes&view=grid', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(4000);

const tcgData = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('li.search-result, [class*="search-result"]').forEach(el => {
    const name = el.querySelector('[class*="productName"], [class*="product-name"], h3')?.textContent?.trim();
    const price = el.querySelector('[class*="price"]')?.textContent?.trim();
    const img = el.querySelector('img')?.src;
    if (name && name.length > 3) items.push({ name: name.slice(0, 80), price, img: img?.slice(0, 130) });
  });
  return items;
});

if (tcgData.length) {
  tcgData.forEach(d => console.log(d.name, '|', d.price, '\n  IMG:', d.img));
} else {
  // grab raw text + images
  const bodyText = await page.evaluate(() => document.body.innerText?.slice(0, 1000));
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll('img[src*="tcgplayer"]')].map(i => ({src: i.src, alt: i.alt})).slice(0, 8)
  );
  console.log('body:', bodyText?.slice(0, 300));
  console.log('imgs:', JSON.stringify(imgs, null, 1));
}

// Target - Ascended Heroes products
console.log('\n=== TARGET ASCENDED HEROES ===');
const targetUrls = [
  { label: 'AH BB', url: 'https://www.target.com/p/-/A-95120834' },
  { label: 'AH Feraligatr EX', url: 'https://www.target.com/p/-/A-95163306' },
  { label: 'AH Meganium EX', url: 'https://www.target.com/p/-/A-95163305' },
  { label: 'AH Emboar EX', url: 'https://www.target.com/p/-/A-1008581387' },
  { label: 'AH Deluxe Pin', url: 'https://www.target.com/p/-/A-95093989' },
];

for (const { label, url } of targetUrls) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2500);
  const title = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim());
  const price = await page.evaluate(() => document.querySelector('[data-test="product-price"]')?.textContent?.trim());
  const img = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')];
    const prod = imgs.find(i => i.src?.includes('target.scene7') && i.width > 100);
    return prod?.src || imgs.find(i => i.src?.includes('scene7'))?.src;
  });
  console.log(`\n${label}:`);
  console.log('  Title:', title?.slice(0, 70));
  console.log('  Price:', price);
  console.log('  Img:', img?.slice(0, 110));
}

// Walmart search for ETB and Display Tins
console.log('\n=== WALMART ASCENDED HEROES ===');
const wUrl = 'https://www.walmart.com/search?q=pokemon+ascended+heroes&cat_id=4171';
await page.goto(wUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const wImgs = await page.evaluate(() =>
  [...document.querySelectorAll('img[src*="walmartimages"]')].map(i => ({ src: i.src?.slice(0, 120), alt: i.alt?.slice(0, 60) })).slice(0, 6)
);
wImgs.forEach(i => console.log(i.alt, '\n  ', i.src));

await browser.close();
