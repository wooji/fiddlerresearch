import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Intercept TCGPlayer API responses for pricing data
const priceData = [];
page.on('response', async res => {
  const url = res.url();
  if ((url.includes('tcgplayer') || url.includes('tcgcsv')) && res.headers()['content-type']?.includes('json')) {
    try {
      const json = await res.json();
      const s = JSON.stringify(json);
      if (/marketPrice|market_price|lowestListing|medianPrice/i.test(s)) {
        priceData.push({ url: url.slice(0, 100), data: s.slice(0, 500) });
      }
    } catch {}
  }
});

await page.goto('https://www.tcgplayer.com/product/668496/pokemon-me-ascended-heroes-ascended-heroes-elite-trainer-box', {
  waitUntil: 'networkidle', timeout: 30000
});
await page.waitForTimeout(3000);

console.log('Intercepted API calls:', priceData.length);
priceData.forEach(d => {
  console.log('URL:', d.url);
  console.log('DATA:', d.data);
  console.log('---');
});

// Also try wait for the price element to appear
const priceEl = await page.$('[class*="market-price"], [class*="marketPrice"], [data-testid*="price"]');
if (priceEl) {
  console.log('Price el text:', await priceEl.textContent());
}

// Grab all text after JS renders
const allText = await page.evaluate(() => document.body.innerText);
const $ = allText.match(/\$[\d,]+\.?\d*/g) || [];
console.log('$ values on page:', $.slice(0, 20).join(' | '));

// Also check the page title
console.log('Title:', await page.title());

await browser.close();
