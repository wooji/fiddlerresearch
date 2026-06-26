import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const env = Object.fromEntries(
  readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Capture chatbot responses
const chatbotResponses = [];
page.on('response', async resp => {
  if (resp.url().includes('zapier') || resp.url().includes('dealernet-bot')) {
    try {
      const body = await resp.text();
      chatbotResponses.push({ url: resp.url(), body: body.slice(0, 1000) });
    } catch {}
  }
});

await page.goto('https://www.dealernetx.com/login.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(500);
await page.evaluate(({user,pass}) => {
  document.querySelector('input[name="userName"]').value = user;
  document.querySelector('input[name="userPass"]').value = pass;
  document.querySelector('button[name="loginBtn"]').click();
}, { user: env.DEALERNET_USER, pass: env.DEALERNET_PASS });
await page.waitForTimeout(3000);

// ── 1. Probe PURCHASESALL with keyword filter ──
console.log('=== PURCHASES ALL (keyword filter) ===');
await page.goto('https://www.dealernetx.com/offers.php?offerfilter=PURCHASESALL', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2000);

// Try filling the keyword search on this page
const kwInput = page.locator('input[name="keywordsearch"], input[name="filterkeyword"]').first();
if (await kwInput.isVisible({ timeout: 3000 }).catch(()=>false)) {
  console.log('Found keyword input on purchases page');
  await kwInput.fill('2024 Topps Inception Baseball');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
}
const purchRows = await page.evaluate(() =>
  Array.from(document.querySelectorAll('table tr')).slice(0,30)
    .map(r => Array.from(r.querySelectorAll('td')).map(c=>c.innerText?.trim().replace(/\s+/g,' ')).filter(Boolean))
    .filter(r=>r.length>2).map(r=>r.join(' | ')).slice(0,15)
);
console.log('Purchase rows:', purchRows);

// ── 2. Probe SALESALL ──
console.log('\n=== SALES ALL ===');
await page.goto('https://www.dealernetx.com/offers.php?offerfilter=SALESALL', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2000);
const saleRows = await page.evaluate(() =>
  Array.from(document.querySelectorAll('table tr')).slice(0,20)
    .map(r => Array.from(r.querySelectorAll('td')).map(c=>c.innerText?.trim().replace(/\s+/g,' ')).filter(Boolean))
    .filter(r=>r.length>2).map(r=>r.join(' | '))
);
console.log('Sales rows:', saleRows.slice(0,10));

// ── 3. Try sold/accepted offers filter ──
console.log('\n=== ACCEPTANCE (6 months) ===');
await page.goto('https://www.dealernetx.com/offers.php?offerfilter=ACCEPTANCE', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2000);
const accRows = await page.evaluate(() => document.body.innerText.slice(0,2000));
console.log(accRows.slice(0,500));

// ── 4. Probe Zapier chatbot directly ──
console.log('\n=== CHATBOT SESSION ===');
console.log('Chatbot responses captured:', chatbotResponses.length);
chatbotResponses.forEach(r => console.log(r.url, '\n', r.body.slice(0,300)));

await browser.close();
