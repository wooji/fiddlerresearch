import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  locale: 'en-US',
  extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
});
const page = await ctx.newPage();

const url = 'https://www.ebay.com/sch/i.html?_nkw=pokemon+ascended+heroes+elite+trainer+box&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc&LH_ItemCondition=1000';
console.log('Loading eBay sold listings...');
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(3000);

const items = await page.evaluate(() => {
  const results = [];
  document.querySelectorAll('.s-item').forEach(el => {
    const title = el.querySelector('.s-item__title')?.textContent?.trim();
    const price = el.querySelector('.s-item__price')?.textContent?.trim();
    const date  = el.querySelector('.s-item__ended-date, .POSITIVE, .s-item__caption--signal')?.textContent?.trim();
    if (title && title !== 'Shop on eBay' && price) results.push({ title: title.slice(0, 65), price, date });
  });
  return results;
});

if (items.length) {
  console.log(`Found ${items.length} sold listings:`);
  items.slice(0, 15).forEach(i => console.log(`  ${i.price} | ${i.date || ''} | ${i.title}`));

  // Stats
  const prices = items
    .map(i => parseFloat(i.price.replace(/[^0-9.]/g, '')))
    .filter(p => p > 50 && p < 400);
  const sorted = [...prices].sort((a,b) => a-b);
  const avg = (prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2);
  console.log(`\nStats: Count=${prices.length} | Avg=$${avg} | Low=$${sorted[0]} | High=$${sorted.at(-1)}`);
  console.log(`P25=$${sorted[Math.floor(sorted.length*.25)]} | Median=$${sorted[Math.floor(sorted.length*.5)]} | P75=$${sorted[Math.floor(sorted.length*.75)]}`);
} else {
  const bodyText = await page.evaluate(() => document.body.innerText?.slice(0, 400));
  console.log('No items. Body:', bodyText);
}

await browser.close();
