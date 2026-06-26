import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const env = Object.fromEntries(
  readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Intercept XHR/fetch calls to find API endpoints
const apiCalls = [];
page.on('request', req => {
  if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
    apiCalls.push({ url: req.url(), method: req.method() });
  }
});
page.on('response', async resp => {
  if (resp.url().includes('dealernetx') && /json|api/i.test(resp.headers()['content-type'] ?? '')) {
    try { console.log('JSON API:', resp.url(), (await resp.text()).slice(0,200)); } catch {}
  }
});

await page.goto('https://www.dealernetx.com/login.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(500);
await page.evaluate(({user,pass}) => {
  document.querySelector('input[name="userName"]').value = user;
  document.querySelector('input[name="userPass"]').value = pass;
  document.querySelector('button[name="loginBtn"]').click();
}, { user: env.DEALERNET_USER, pass: env.DEALERNET_PASS });
await page.waitForTimeout(2500);

// Try various URL patterns that might bypass the pending-offer gate
const testUrls = [
  // Direct search endpoints
  'https://www.dealernetx.com/listings.php?listingtypeid=2&keyword=2024+inception+baseball',
  'https://www.dealernetx.com/listings.php?listingtypeid=1&keyword=2024+inception+baseball', // type 1
  'https://www.dealernetx.com/marketplace.php?search=2024+inception',
  'https://www.dealernetx.com/products.php?search=inception',
  'https://www.dealernetx.com/search.php?q=inception',
  // Sales history — might not be gated
  'https://www.dealernetx.com/listings.php?offerfilter=SALE&keyword=inception',
  // Past sold listings
  'https://www.dealernetx.com/offers.php?offerfilter=PURCHASESALL',
  // Product catalog separate from marketplace
  'https://www.dealernetx.com/catalog.php',
  'https://www.dealernetx.com/products.php',
];

for (const url of testUrls) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const finalUrl = page.url();
    const blocked = finalUrl.includes('pendingin') || finalUrl.includes('pgsmsg');
    const bodySnip = (await page.evaluate(() => document.body.innerText.slice(0,300))).replace(/\s+/g,' ').trim();
    console.log(`\n[${blocked ? 'BLOCKED' : 'OK    '}] ${url.slice(40)}`);
    if (!blocked) console.log('  →', bodySnip.slice(0,200));
  } catch (e) { console.log(`[ERROR ] ${url.slice(40)} — ${e.message.slice(0,50)}`); }
}

console.log('\nAPI calls intercepted:', apiCalls.slice(0,10));
await browser.close();
