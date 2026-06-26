import { chromium } from 'playwright';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const browser = await chromium.launch({ headless: true });

// 1. Search Reddit without subreddit restriction
console.log('=== REDDIT BROAD SEARCH ===');
const queries = ['Prismatic Evolutions ETB price', 'Chaos Rising Pokemon', 'Pitch Black Pokemon TCG'];
for (const q of queries) {
  const r = await fetch(`https://reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&limit=5`, {
    headers: { 'User-Agent': 'fiddler-research/1.0' }
  });
  const j = await r.json();
  const posts = j?.data?.children || [];
  if (posts.length) {
    console.log(`\nq="${q}":`);
    posts.slice(0, 3).forEach(p => console.log(`  [r/${p.data.subreddit}] ${p.data.title} (${p.data.score}pts)`));
  }
  await new Promise(res => setTimeout(res, 800));
}

// 2. Pokemon TCG product listing pages
console.log('\n=== POKEMON CENTER SEARCH (PLAYWRIGHT) ===');
const page = await browser.newPage();
await page.goto('https://www.pokemoncenter.com/en-us/category/pokemon-tcg?query=prismatic+evolutions', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
const html = await page.content();
// find product names and prices
const products = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('[class*="product"]').forEach(el => {
    const name = el.querySelector('[class*="name"], [class*="title"], h2, h3')?.textContent?.trim();
    const price = el.querySelector('[class*="price"]')?.textContent?.trim();
    if (name && name.length > 5) items.push({ name: name.slice(0, 80), price });
  });
  return items.slice(0, 10);
});
console.log('Products found:', products.length);
products.forEach(p => console.log(' ', p.name, '|', p.price));
await page.close();

// 3. Direct Pokemon Center image URLs for known products
console.log('\n=== POKEMON CENTER IMAGE SEARCH ===');
const page2 = await browser.newPage();

const searches = [
  'prismatic evolutions elite trainer box',
  'prismatic evolutions super premium',
  'chaos rising',
  'pitch black',
];

for (const q of searches) {
  await page2.goto(`https://www.pokemoncenter.com/en-us/search?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page2.waitForTimeout(2000);
  const imgs = await page2.evaluate(() => {
    const imgs = [...document.querySelectorAll('img[src*="pokemoncenter"], img[src*="pokemon"]')];
    return imgs.map(i => ({ src: i.src, alt: i.alt })).filter(i => i.src.includes('http')).slice(0, 3);
  });
  const prices = await page2.evaluate(() => {
    return [...document.querySelectorAll('[class*="price"]')].map(e => e.textContent?.trim()).filter(Boolean).slice(0, 5);
  });
  console.log(`\nq="${q}": ${imgs.length} imgs | prices: ${prices.slice(0,3).join(', ')}`);
  imgs.forEach(i => console.log('  IMG:', i.src?.slice(0, 100), '|', i.alt?.slice(0, 40)));
}

await page2.close();
await browser.close();
