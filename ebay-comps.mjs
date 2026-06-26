import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const url = 'https://www.ebay.com/sch/i.html?_nkw=hot+wheels+rlc+1962+ford+f100&LH_Sold=1&LH_Complete=1';
await page.goto(url, {waitUntil:'domcontentloaded', timeout:30000});
await page.waitForTimeout(3000);

const html = await page.content();
console.log('page length:', html.length);
console.log('has captcha:', html.includes('captcha') || html.includes('robot'));
const titleMatch = html.match(/<title>([^<]+)/);
console.log('title:', titleMatch?.[1]);

const priceRe = /\$([0-9]+\.[0-9]{2})/g;
const prices = [];
let m;
while ((m = priceRe.exec(html)) !== null) {
  const v = parseFloat(m[1]);
  if (v > 10 && v < 300) prices.push(v);
}
console.log('prices found:', prices.length, prices.slice(0,15));

await browser.close();
