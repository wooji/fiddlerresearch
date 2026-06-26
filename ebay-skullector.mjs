import { chromium } from 'playwright';

const searches = [
  { q: 'Monster High Skullector Alien Doll', label: 'Alien' },
  { q: 'Monster High Skullector Coraline', label: 'Coraline' },
  { q: 'Monster High Skullector Beetlejuice', label: 'Beetlejuice' },
];

const browser = await chromium.launch({ headless: true });

for (const { q, label } of searches) {
  const page = await browser.newPage();
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const html = await page.content();

  // debug
  console.log(`\n=== ${label} ===`);
  console.log('Page length:', html.length);
  console.log('Captcha/error:', html.includes('captcha') || html.includes('Error Page'));
  console.log('Title:', html.match(/<title>([^<]+)/)?.[1]);

  // try multiple price selectors
  const prices1 = [...html.matchAll(/\$([0-9]+\.[0-9]{2})/g)].map(m => parseFloat(m[1])).filter(p => p > 15 && p < 500);
  console.log('Price matches:', prices1.length, prices1.slice(0, 8));

  await page.close();
}

await browser.close();
