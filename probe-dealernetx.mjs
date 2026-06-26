import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);
const USER = env.DEALERNET_USER ?? 'GA-GAMING';
const PASS = env.DEALERNET_PASS ?? '';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const BASE = 'https://www.dealernetx.com';

// Login via form submit
console.log('=== DEALERNETX LOGIN ===');
await page.goto(`${BASE}/login.php`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(1000);
await page.evaluate(({ user, pass }) => {
  document.querySelector('input[name="userName"]').value = user;
  document.querySelector('input[name="userPass"]').value = pass;
  document.querySelector('button[name="loginBtn"], input[name="loginBtn"], form').submit();
  if (document.querySelector('button[name="loginBtn"]')) document.querySelector('button[name="loginBtn"]').click();
}, { user: USER, pass: PASS });
await page.waitForTimeout(3000);
console.log('URL after login:', page.url());

// Check if logged in
const loggedIn = await page.evaluate(() => !!document.querySelector('a[href*="logout"], .logout, #logout'));
console.log('Logged in:', loggedIn, '| Title:', await page.title());

// Pokemon category (categoryid=1561, listingtypeid=2)
console.log('\n--- POKEMON listings (cat 1561) ---');
await page.goto(`${BASE}/listings.php?listingtypeid=2&categoryid=1561`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2000);

const pokeListings = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('.listing-row, .listing, tr[class*="listing"], .product-row').forEach(el => {
    const text = el.innerText?.replace(/\s+/g, ' ').trim().slice(0, 150);
    if (text && text.length > 10) items.push(text);
  });
  return items.length ? items : [document.body.innerText?.slice(0, 2000)];
});
pokeListings.slice(0, 20).forEach(l => console.log(l));

// Magic The Gathering (cat 1541)
console.log('\n--- MTG listings (cat 1541) ---');
await page.goto(`${BASE}/listings.php?listingtypeid=2&categoryid=1541`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2000);
const mtgText = await page.evaluate(() => document.body.innerText?.slice(0, 1500));
console.log(mtgText?.slice(0, 800));

// One Piece (cat 1606)
console.log('\n--- ONE PIECE (cat 1606) ---');
await page.goto(`${BASE}/listings.php?listingtypeid=2&categoryid=1606`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2000);
const opText = await page.evaluate(() => document.body.innerText?.slice(0, 1500));
console.log(opText?.slice(0, 600));

await browser.close();
