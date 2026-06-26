import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Erika Collection product ID
console.log('=== TCGPLAYER: Erika Collection ID ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/product?q=ascended+heroes+erika&view=grid', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const erikaLinks = await page.evaluate(() => {
  const links = [];
  document.querySelectorAll('a[href*="/product/"]').forEach(a => {
    const m = a.href.match(/\/product\/(\d+)/);
    const name = a.textContent?.trim()?.slice(0, 80);
    if (m && name && /erika|ascend/i.test(name)) links.push({ id: m[1], name });
  });
  return [...new Map(links.map(l => [l.id, l])).values()];
});
erikaLinks.forEach(p => console.log(`ID: ${p.id} | ${p.name}`));

// Mini Tin Display market price
console.log('\n=== TCGPLAYER: Mini Tin Display market price ===');
await page.goto('https://www.tcgplayer.com/product/679556/pokemon-me-ascended-heroes-ascended-heroes-mini-tin-display', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const tinData = await page.evaluate(() => {
  const price = document.querySelector('[class*="market-price"], [class*="marketPrice"]')?.textContent?.trim();
  const title = document.querySelector('h1')?.textContent?.trim();
  const img = document.querySelector('img[class*="product"], img[alt*="Tin"], img[alt*="Display"]')?.src;
  return { title, price, img };
});
console.log('Title:', tinData.title);
console.log('Price:', tinData.price);
console.log('IMG:', tinData.img);

// Also get retail price from Target for tins
console.log('\n=== TARGET: AH Mini Tin ===');
await page.goto('https://www.target.com/s?searchTerm=pokemon+ascended+heroes+tin', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(4000);
const tinCards = await page.evaluate(() => {
  const cards = [];
  document.querySelectorAll('[data-test="product-card"]').forEach(card => {
    const title = card.querySelector('a[data-test="product-title"]')?.textContent?.trim();
    const price = card.querySelector('[data-test="current-price"]')?.textContent?.trim();
    const img = card.querySelector('img')?.src;
    if (title) cards.push({ title: title.slice(0, 70), price, img: img?.slice(0, 130) });
  });
  return cards.slice(0, 6);
});
tinCards.forEach(c => console.log(c.title, '|', c.price, '\n  IMG:', c.img?.slice(0, 100)));

// Get Target ETB page image
console.log('\n=== TARGET: AH ETB product ===');
await page.goto('https://www.target.com/s?searchTerm=pokemon+ascended+heroes+elite+trainer+box', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(4000);
const etbText = await page.evaluate(() => {
  const first = document.querySelector('[data-test="product-card"]');
  if (!first) return document.body.innerText?.slice(0, 300);
  const title = first.querySelector('a[data-test="product-title"]')?.textContent?.trim();
  const price = first.querySelector('[data-test="current-price"]')?.textContent?.trim();
  const img = first.querySelector('img')?.src;
  const link = first.querySelector('a')?.href;
  return JSON.stringify({ title, price, img: img?.slice(0, 130), link: link?.slice(0, 80) });
});
console.log(etbText);

await browser.close();
