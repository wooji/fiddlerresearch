import { chromium } from 'playwright';
import { Level } from 'level';

// Read proxy from order-tracker LevelDB
const db = new Level('C:/Users/Christopher/AppData/Roaming/order-tracker/Local Storage/leveldb', { valueEncoding: 'utf8' });
let proxy = null;
try {
  for await (const [key, val] of db.iterator({ limit: 50 })) {
    if (typeof val === 'string' && val.match(/^\d+\.\d+\.\d+\.\d+:\d+:/)) {
      proxy = val.trim().split('\n')[0].trim();
      console.log('Found proxy:', proxy.split(':').slice(0,2).join(':'));
      break;
    }
  }
} catch(e) { console.log('LevelDB err:', e.message); }
await db.close();

if (!proxy) { console.log('No proxy found'); process.exit(1); }

const [host, port, user, pass] = proxy.split(':');
const browser = await chromium.launch({
  headless: true,
  proxy: { server: `http://${host}:${port}`, username: user, password: pass }
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

const url = 'https://www.ebay.com/sch/i.html?_nkw=pokemon+ascended+heroes+elite+trainer+box&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc';
console.log('Loading via proxy...');
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(3000);

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
  console.log(`Found ${items.length} sold listings:`);
  items.slice(0, 15).forEach(i => console.log(`  ${i.price} | ${i.date || ''} | ${i.title}`));
  const prices = items.map(i => parseFloat(i.price.replace(/[^0-9.]/g,''))).filter(p => p > 50 && p < 400);
  const sorted = [...prices].sort((a,b)=>a-b);
  const avg = (prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2);
  console.log(`\nCount=${prices.length} | Avg=$${avg} | Low=$${sorted[0]} | High=$${sorted.at(-1)} | Median=$${sorted[Math.floor(sorted.length/2)]}`);
} else {
  console.log('No items:', (await page.evaluate(() => document.body.innerText))?.slice(0, 200));
}

await browser.close();
