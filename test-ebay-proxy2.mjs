import { chromium } from 'playwright';

const PROXY = { server: 'http://40.27.103.2:3128', username: 'xyz8638', password: 'p7z9vk20xmo83z68' };

const browser = await chromium.launch({ headless: true, proxy: PROXY });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
});
const page = await ctx.newPage();

// Verify proxy IP first
const ipRes = await page.goto('https://api.ipify.org?format=json', { waitUntil: 'domcontentloaded', timeout: 15000 });
const ipText = await page.evaluate(() => document.body.innerText);
console.log('Proxy IP:', ipText);

// eBay sold listings
const url = 'https://www.ebay.com/sch/i.html?_nkw=pokemon+ascended+heroes+elite+trainer+box&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc';
console.log('\nLoading eBay sold...');
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(3500);

const items = await page.evaluate(() => {
  const results = [];
  document.querySelectorAll('.s-item').forEach(el => {
    const title = el.querySelector('.s-item__title')?.textContent?.trim();
    const price = el.querySelector('.s-item__price')?.textContent?.trim();
    const date  = el.querySelector('.s-item__ended-date, .POSITIVE')?.textContent?.trim();
    if (title && title !== 'Shop on eBay' && price) results.push({ title: title.slice(0, 65), price, date });
  });
  return results;
});

if (items.length) {
  console.log(`\n${items.length} sold listings:`);
  items.slice(0, 15).forEach(i => console.log(`  ${i.price} | ${i.date || ''} | ${i.title}`));
  const prices = items.map(i => parseFloat(i.price.replace(/[^0-9.]/g,''))).filter(p => p > 50 && p < 400);
  const sorted = [...prices].sort((a,b)=>a-b);
  const avg = (prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2);
  console.log(`\nCount=${prices.length} | Avg=$${avg} | Low=$${sorted[0]} | High=$${sorted.at(-1)} | Median=$${sorted[Math.floor(sorted.length/2)]}`);
} else {
  console.log('No items:', (await page.evaluate(() => document.body.innerText))?.slice(0, 200));
}

await browser.close();
