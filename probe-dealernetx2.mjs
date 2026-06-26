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

await page.goto(`${BASE}/login.php`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(500);
await page.evaluate(({ user, pass }) => {
  document.querySelector('input[name="userName"]').value = user;
  document.querySelector('input[name="userPass"]').value = pass;
  document.querySelector('button[name="loginBtn"]').click();
}, { user: USER, pass: PASS });
await page.waitForTimeout(2500);

async function scrapeListings(url, label) {
  console.log(`\n=== ${label} ===`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(2000);

  const rows = await page.evaluate(() => {
    const results = [];
    // Try table rows
    document.querySelectorAll('table tr').forEach(tr => {
      const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText?.trim().replace(/\s+/g, ' '));
      if (cells.length >= 3 && cells.some(c => /\$|\d/.test(c))) {
        results.push(cells.filter(c => c).join(' | '));
      }
    });
    // Try listing divs
    if (!results.length) {
      document.querySelectorAll('.listing-item, .listing-row, [class*="listing"]').forEach(el => {
        const t = el.innerText?.trim().replace(/\s+/g, ' ').slice(0, 200);
        if (t) results.push(t);
      });
    }
    return results;
  });

  if (rows.length) {
    rows.slice(0, 25).forEach(r => console.log(r));
  } else {
    // Dump raw text
    const txt = await page.evaluate(() => document.body.innerText?.replace(/\s+/g, ' ').slice(0, 3000));
    console.log('RAW:', txt?.slice(0, 2000));
  }
}

// Pokemon ETBs specifically
await scrapeListings(`${BASE}/listings.php?listingtypeid=2&categoryid=1561&boxtypeid=etb`, 'POKEMON — ETB');
await scrapeListings(`${BASE}/listings.php?listingtypeid=2&categoryid=1561&boxtypeid=etb+pkc`, 'POKEMON — ETB PKC');
await scrapeListings(`${BASE}/listings.php?listingtypeid=2&categoryid=1561&boxtypeid=m1`, 'POKEMON — M1 (UPC/Special)');
await scrapeListings(`${BASE}/listings.php?listingtypeid=2&categoryid=1561&boxtypeid=booster+%28collector%29`, 'POKEMON — Collector Booster');

await browser.close();
