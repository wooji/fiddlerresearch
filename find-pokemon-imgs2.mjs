import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Try TCGPlayer for product images
const queries = [
  { label: 'PE ETB', url: 'https://www.tcgplayer.com/search/pokemon/product?q=prismatic+evolutions+elite+trainer+box&view=grid' },
  { label: 'Chaos Rising', url: 'https://www.tcgplayer.com/search/pokemon/product?q=chaos+rising&view=grid' },
  { label: 'Pitch Black', url: 'https://www.tcgplayer.com/search/pokemon/product?q=pitch+black+pokemon&view=grid' },
];

for (const { label, url } of queries) {
  console.log(`\n=== ${label} ===`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(3000);

  const data = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('[class*="search-result"], [class*="product"]').forEach(el => {
      const name = el.querySelector('[class*="name"], h3, h4')?.textContent?.trim();
      const price = el.querySelector('[class*="price"]')?.textContent?.trim();
      const img = el.querySelector('img')?.src;
      if (name && name.length > 3) items.push({ name: name.slice(0, 60), price, img: img?.slice(0, 120) });
    });
    return items.slice(0, 3);
  });

  if (data.length) {
    data.forEach(d => {
      console.log('NAME:', d.name);
      console.log('PRICE:', d.price);
      console.log('IMG:', d.img);
    });
  } else {
    console.log('page title:', await page.title());
    // try getting any product images
    const imgs = await page.evaluate(() =>
      [...document.querySelectorAll('img')].map(i => i.src).filter(s => s && s.startsWith('http') && !s.includes('icon') && !s.includes('logo')).slice(0, 3)
    );
    console.log('imgs:', imgs);
  }
}

// Try direct Pokemon Center product pages with Playwright (JS-rendered)
console.log('\n=== POKEMON CENTER CHAOS RISING (PLAYWRIGHT) ===');
await page.goto('https://www.pokemoncenter.com/en-us/product/10-10399-101', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(5000);
const pcTitle = await page.evaluate(() => document.querySelector('h1')?.textContent);
const pcPrice = await page.evaluate(() => document.querySelector('[class*="price"]')?.textContent);
const pcImg = await page.evaluate(() => document.querySelector('img[class*="product"]')?.src || document.querySelector('.product img')?.src);
console.log('Title:', pcTitle);
console.log('Price:', pcPrice);
console.log('Img:', pcImg);

await browser.close();
