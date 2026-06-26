/**
 * Search TCGPlayer for XY Evolutions products
 */
import { chromium } from 'playwright';

async function searchTCG(query) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const url = `https://www.tcgplayer.com/search/pokemon/sealed-products?q=${encodeURIComponent(query)}`;
    console.log(`Searching: ${query}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    const products = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/product/"]'))
        .map(a => {
          const href = a.href;
          const idMatch = href.match(/\/product\/(\d+)\//);
          const name = a.textContent?.trim();
          return {
            name,
            id: idMatch ? idMatch[1] : null,
            url: href
          };
        })
        .filter((p, i) => i < 5 && p.id);
    });

    for (const p of products) {
      console.log(`  ${p.name?.substring(0, 50)} (ID: ${p.id})`);
    }
  } finally {
    await browser.close();
  }
}

await searchTCG('XY Evolutions Elite Trainer Box');
await searchTCG('XY Evolutions Booster Box');
await searchTCG('XY Evolutions Booster Pack');
