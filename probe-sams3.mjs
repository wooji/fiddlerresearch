import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Try domcontentloaded instead of networkidle
await page.goto('https://www.samsclub.com/search?searchTerm=pokemon+ascended+heroes+heavy+hitters', {
  waitUntil: 'domcontentloaded', timeout: 20000
});
await page.waitForTimeout(5000);
const text = await page.evaluate(() => document.body.innerText?.slice(0, 1500));
console.log(text?.slice(0, 800));

// Also try direct product lookup via fetch
console.log('\n=== SAMS fetch: pokemon heavy hitters ===');
const r = await fetch('https://www.samsclub.com/search?searchTerm=pokemon+heavy+hitters', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html',
    'Accept-Language': 'en-US,en;q=0.9',
  }
});
const html = await r.text();
// extract product names from JSON in page
const matches = [...html.matchAll(/"displayName"\s*:\s*"([^"]{10,100})"/g)].filter(m => /pokemon|heavy|hitter|ascend/i.test(m[1]));
matches.slice(0, 8).forEach(m => console.log(m[1]));
// extract prices
const prices = [...html.matchAll(/"finalPrice"\s*:\s*([\d.]+)/g)];
prices.slice(0, 5).forEach(m => console.log('PRICE:', m[1]));
// extract image URLs
const imgs = [...html.matchAll(/https:\/\/scene7\.samsclub\.com\/is\/image\/[^\s"'?]+/g)];
imgs.slice(0, 5).forEach(m => console.log('IMG:', m[0].slice(0, 100)));

// Try TCGPlayer for "heavy hitters" pokemon
console.log('\n=== TCGPLAYER: heavy hitters ===');
const r2 = await fetch('https://www.tcgplayer.com/search/pokemon/product?q=heavy+hitters&view=grid', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
});
const html2 = await r2.text();
const tcgMatches = [...html2.matchAll(/ascend|heavy\s*hit/gi)];
console.log('TCG hits:', tcgMatches.length);
if (html2.includes('Heavy Hitters') || html2.includes('heavy hitters')) {
  const idx = html2.toLowerCase().indexOf('heavy hitter');
  console.log('CTX:', html2.slice(Math.max(0, idx-50), idx+200));
}

await browser.close();
