import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Direct TCGPlayer AH set page — sealed products
console.log('=== TCGPLAYER AH SET ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/mega-evolution-ascended-heroes?productLineName=pokemon&productTypes=Sealed+Products&view=grid', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(4000);
const tcgRaw = await page.evaluate(() => document.body.innerText);
console.log(tcgRaw.slice(0, 3000));

// Target: search for AH ETB specifically — grab all product cards
console.log('\n=== TARGET: AH ETB + Tins ===');
await page.goto('https://www.target.com/s?searchTerm=ascended+heroes+elite+trainer', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(4000);
const targetETB = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('div[data-test="product-card"]').forEach(card => {
    const title = card.querySelector('a[data-test="product-title"]')?.textContent?.trim();
    const price = card.querySelector('[data-test="current-price"]')?.textContent?.trim();
    const img = card.querySelector('img')?.src;
    const link = card.querySelector('a[data-test="product-title"]')?.href;
    if (title) items.push({ title: title.slice(0, 70), price, img: img?.slice(0, 120), link: link?.slice(0, 80) });
  });
  return items;
});
if (targetETB.length) targetETB.forEach(i => console.log(i.title, '|', i.price, '\n  LINK:', i.link, '\n  IMG:', i.img));
else console.log(await page.evaluate(() => document.body.innerText?.slice(0, 300)));

// Target: search for tins
console.log('\n=== TARGET: AH tins ===');
await page.goto('https://www.target.com/s?searchTerm=pokemon+mega+evolution+tin', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(4000);
const targetTins = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('div[data-test="product-card"]').forEach(card => {
    const title = card.querySelector('a[data-test="product-title"]')?.textContent?.trim();
    const price = card.querySelector('[data-test="current-price"]')?.textContent?.trim();
    const img = card.querySelector('img')?.src;
    if (title) items.push({ title: title.slice(0, 70), price, img: img?.slice(0, 120) });
  });
  return items;
});
if (targetTins.length) targetTins.slice(0, 6).forEach(i => console.log(i.title, '|', i.price, '\n  IMG:', i.img));
else console.log(await page.evaluate(() => document.body.innerText?.slice(0, 300)));

await browser.close();
