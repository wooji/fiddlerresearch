import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Get TCGPlayer product IDs from AH search results (URLs contain ID)
console.log('=== TCGPLAYER AH: product IDs from card links ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/mega-evolution-ascended-heroes?productLineName=pokemon&q=ascended+heroes&view=grid', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(4000);
const productLinks = await page.evaluate(() => {
  const links = [];
  document.querySelectorAll('a[href*="/product/"]').forEach(a => {
    const href = a.href;
    const idMatch = href.match(/\/product\/(\d+)/);
    const name = a.textContent?.trim()?.slice(0, 80);
    if (idMatch && name && name.length > 3) links.push({ id: idMatch[1], name, href: href.slice(0, 100) });
  });
  return [...new Map(links.map(l => [l.id, l])).values()].slice(0, 15);
});
productLinks.forEach(p => console.log(`ID: ${p.id} | ${p.name}`));
productLinks.forEach(p => console.log(`  CDN: https://tcgplayer-cdn.tcgplayer.com/product/${p.id}_in_400x400.jpg`));

// Search for Display Tins
console.log('\n=== TCGPLAYER: ascended heroes display tin ===');
await page.goto('https://www.tcgplayer.com/search/pokemon/product?q=ascended+heroes+display&view=grid', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const tinLinks = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('a[href*="/product/"]').forEach(a => {
    const idMatch = a.href.match(/\/product\/(\d+)/);
    const name = a.textContent?.trim()?.slice(0, 80);
    if (idMatch && name && name.length > 3 && /ascend|tin|display|collection/i.test(name)) items.push({ id: idMatch[1], name });
  });
  return [...new Map(items.map(l => [l.id, l])).values()];
});
tinLinks.forEach(p => console.log(`ID: ${p.id} | ${p.name}`));

// Target: get the ETB product page image
console.log('\n=== TARGET: AH ETB image ===');
await page.goto('https://www.target.com/s?searchTerm=pokemon+ascended+heroes+elite+trainer+box', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(4000);
const etbCards = await page.evaluate(() => {
  const cards = [];
  document.querySelectorAll('[data-test="product-card"]').forEach(card => {
    const title = card.querySelector('a[data-test="product-title"]')?.textContent?.trim();
    const price = card.querySelector('[data-test="current-price"]')?.textContent?.trim();
    const img = card.querySelector('img')?.src;
    const link = card.querySelector('a')?.href;
    if (title) cards.push({ title: title.slice(0, 70), price, img: img?.slice(0, 130), link: link?.slice(0,80) });
  });
  return cards.slice(0, 5);
});
etbCards.forEach(c => console.log(c.title, '|', c.price, '\n  IMG:', c.img, '\n  LINK:', c.link));

await browser.close();
