import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Get Mini Tin Display market price from search results
await page.goto('https://www.tcgplayer.com/search/pokemon/product?q=ascended+heroes+mini+tin&view=grid', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3500);
const rawText = await page.evaluate(() => document.body.innerText);
// Find market price near Mini Tin Display
const idx = rawText.indexOf('Mini Tin Display');
if (idx > -1) console.log('CONTEXT:', rawText.slice(idx, idx+200));
else console.log(rawText.slice(0, 500));

// Also verify image URLs actually load
console.log('\n=== IMAGE VERIFICATION ===');
const ids = [668496, 668541, 666906, 666907, 679556];
for (const id of ids) {
  const url = `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_400x400.jpg`;
  const r = await fetch(url, { method: 'HEAD' });
  console.log(id, ':', r.status, r.headers.get('content-type')?.slice(0, 20));
}

await browser.close();
