import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const BASE = 'https://www.dealernetx.com';

await page.goto(`${BASE}/login.php`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(500);
await page.evaluate(({ user, pass }) => {
  document.querySelector('input[name="userName"]').value = user;
  document.querySelector('input[name="userPass"]').value = pass;
  document.querySelector('button[name="loginBtn"]').click();
}, { user: env.DEALERNET_USER, pass: env.DEALERNET_PASS });
await page.waitForTimeout(2500);

// Get ALL Pokemon listings
console.log('=== ALL POKEMON LISTINGS ===');
await page.goto(`${BASE}/listings.php?listingtypeid=2&categoryid=1561`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// Dump the full page to understand structure
const html = await page.content();
const text = await page.evaluate(() => document.body.innerText);

// Find all listing rows - try multiple selectors
const listings = await page.evaluate(() => {
  const results = [];

  // Try to find the listing table
  const tables = document.querySelectorAll('table');
  tables.forEach((table, ti) => {
    const rows = table.querySelectorAll('tr');
    if (rows.length > 2) {
      rows.forEach((row, ri) => {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.innerText?.trim().replace(/\s+/g, ' ').slice(0, 100));
        if (cells.length >= 2 && cells.some(c => c.length > 3)) {
          results.push(`T${ti}R${ri}: ${cells.filter(c=>c).join(' | ')}`);
        }
      });
    }
  });

  return results;
});

if (listings.length) {
  listings.slice(0, 60).forEach(l => console.log(l));
} else {
  // Just dump page text
  console.log(text?.slice(0, 5000));
}

// Also check offers page for GA-GAMING account
console.log('\n=== CURRENT OFFERS (Incoming) ===');
await page.goto(`${BASE}/offers.php?offerfilter=PENDINGIN`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2000);
const offersText = await page.evaluate(() => document.body.innerText?.slice(0, 3000));
console.log(offersText);

await browser.close();
