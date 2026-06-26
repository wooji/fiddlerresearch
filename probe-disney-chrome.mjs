import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Search for individual cards to find the actual product name
const queries = [
  'Topps Chrome Disney 2026 card',
  'Topps Chrome Disney baseball 2026',
  'Topps Chrome Disney football 2026',
  '2026 Topps Disney Chrome auto',
  'Topps Disney Chrome refractor',
];

for (const q of queries) {
  try {
    await page.goto(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sop=15`, {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    const items = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.s-item')).slice(0,4).map(el => ({
        t: el.querySelector('.s-item__title')?.textContent?.trim(),
        p: el.querySelector('.s-item__price')?.textContent?.trim(),
      })).filter(i => i.t && !i.t.includes('Shop on eBay'))
    );
    if (items.length) {
      console.log(`\n"${q}":`);
      items.forEach(i => console.log(' ', i.p, '|', i.t?.slice(0,90)));
    } else {
      console.log(`"${q}": 0`);
    }
  } catch(e) { console.log(q, '— skip'); }
}

// Try Beckett / COMC for product name
await page.goto('https://www.beckett.com/search?q=topps+chrome+disney', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(()=>{});
const beckettText = await page.evaluate(() => document.body.innerText.slice(0,2000)).catch(()=>'');
console.log('\nBeckett search:\n', beckettText.slice(0,1000));

await browser.close();
