import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Direct Sam's Club product page
console.log('=== SAMS: Heavy Hitters product page ===');
await page.goto('https://www.samsclub.com/ip/Pok-mon-Heavy-Hitters-Premium-Collection/13590524234', {
  waitUntil: 'domcontentloaded', timeout: 25000
});
await page.waitForTimeout(5000);
const bodyText = await page.evaluate(() => document.body.innerText?.slice(0, 2000));
console.log(bodyText?.slice(0, 1000));

const img = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')];
  return imgs.map(i => ({ src: i.src?.slice(0, 120), alt: i.alt?.slice(0, 60) })).filter(i => i.src && !i.src.includes('data:')).slice(0, 6);
});
img.forEach(i => console.log('IMG:', i.alt, '|', i.src));

// Try trackalacker for image
console.log('\n=== TRACKALACKER ===');
await page.goto('https://www.trackalacker.com/products/showcase/pokemon-ascended-heroes-heavy-hitters-collection', {
  waitUntil: 'domcontentloaded', timeout: 20000
});
await page.waitForTimeout(3000);
const trackText = await page.evaluate(() => document.body.innerText?.slice(0, 1000));
console.log(trackText?.slice(0, 600));
const trackImgs = await page.evaluate(() =>
  [...document.querySelectorAll('img')].map(i => ({ src: i.src?.slice(0, 120), alt: i.alt?.slice(0, 60) })).filter(i => i.src && !i.src.includes('data:')).slice(0, 4)
);
trackImgs.forEach(i => console.log('IMG:', i.alt, '|', i.src));

// Also check Pitch Black TCGPlayer for CDN image
console.log('\n=== TCGPLAYER PITCH BLACK images ===');
const pitchIds = [692942, 692947, 692949]; // from my earlier data + search results
for (const id of pitchIds) {
  const r = await fetch(`https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_400x400.jpg`, { method: 'HEAD' });
  console.log(id, ':', r.status);
}

await browser.close();
