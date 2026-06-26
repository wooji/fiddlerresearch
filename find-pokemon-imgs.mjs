import { chromium } from 'playwright';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const searches = [
  { q: 'Pokemon TCG Prismatic Evolutions Elite Trainer Box', label: 'PE ETB' },
  { q: 'Pokemon TCG Prismatic Evolutions Super Premium Collection', label: 'PE SPC' },
  { q: 'Pokemon TCG Chaos Rising Elite Trainer Box', label: 'Chaos Rising ETB' },
  { q: 'Pokemon TCG Pitch Black Elite Trainer Box', label: 'Pitch Black ETB' },
];

for (const { q, label } of searches) {
  console.log(`\n=== ${label} ===`);
  try {
    await page.goto(`https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=toys-and-games`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3000);

    const items = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('[data-component-type="s-search-result"]').forEach(el => {
        const title = el.querySelector('h2 span')?.textContent?.trim();
        const price = el.querySelector('.a-price .a-offscreen')?.textContent?.trim();
        const img = el.querySelector('img.s-image')?.src;
        const asin = el.getAttribute('data-asin');
        if (title) results.push({ title: title.slice(0, 80), price, img: img?.slice(0, 120), asin });
      });
      return results.slice(0, 3);
    });

    items.forEach(i => {
      console.log('TITLE:', i.title);
      console.log('PRICE:', i.price, '| ASIN:', i.asin);
      console.log('IMG:', i.img);
    });

    if (!items.length) {
      const title = await page.title();
      console.log('Page title:', title);
    }
  } catch(e) { console.log('ERROR:', e.message.slice(0, 80)); }
}

await browser.close();
