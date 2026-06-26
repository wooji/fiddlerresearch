import { chromium } from 'playwright';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Search Pokemon Center for each product - grab image URLs and prices
const searches = [
  'prismatic evolutions elite trainer box',
  'prismatic evolutions super premium',
  'chaos rising elite trainer',
  'chaos rising booster bundle',
  'pitch black booster',
  'pitch black elite trainer',
];

for (const q of searches) {
  console.log(`\n=== ${q.toUpperCase()} ===`);
  try {
    await page.goto(`https://www.pokemoncenter.com/en-us/search?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3000);

    const results = await page.evaluate(() => {
      const items = [];
      // try various product card selectors
      const cards = document.querySelectorAll('[class*="ProductCard"], [class*="product-card"], [data-testid*="product"], article');
      cards.forEach(card => {
        const name = card.querySelector('h2, h3, [class*="name"], [class*="title"]')?.textContent?.trim();
        const price = card.querySelector('[class*="price"], [class*="Price"]')?.textContent?.trim();
        const img = card.querySelector('img')?.src;
        if (name) items.push({ name: name.slice(0, 80), price, img: img?.slice(0, 120) });
      });
      return items.slice(0, 3);
    });

    if (results.length) {
      results.forEach(r => {
        console.log('NAME:', r.name);
        console.log('PRICE:', r.price);
        console.log('IMG:', r.img);
      });
    } else {
      // fallback: grab all images and prices
      const imgs = await page.evaluate(() =>
        [...document.querySelectorAll('img')].map(i => i.src).filter(s => s && !s.includes('data:') && s.includes('http')).slice(0, 3)
      );
      const prices = await page.evaluate(() =>
        [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /\$[0-9]+/.test(e.textContent)).map(e => e.textContent.trim()).slice(0, 5)
      );
      console.log('IMGS:', imgs);
      console.log('PRICES:', prices);
    }
  } catch(e) { console.log('ERROR:', e.message.slice(0, 100)); }
}

await browser.close();
