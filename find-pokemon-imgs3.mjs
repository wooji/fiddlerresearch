import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Search TCGPlayer for specific product types
const searches = [
  { label: 'PE ETB', url: 'https://www.tcgplayer.com/search/pokemon/product?q=prismatic+evolutions+elite+trainer+box&productLineName=pokemon&view=grid' },
  { label: 'PE SPC', url: 'https://www.tcgplayer.com/search/pokemon/product?q=prismatic+evolutions+super+premium+collection&view=grid' },
  { label: 'Chaos Rising ETB', url: 'https://www.tcgplayer.com/search/pokemon/product?q=chaos+rising+elite+trainer+box&view=grid' },
  { label: 'Chaos Rising BB', url: 'https://www.tcgplayer.com/search/pokemon/product?q=chaos+rising+booster+bundle&view=grid' },
  { label: 'Pitch Black ETB', url: 'https://www.tcgplayer.com/search/pokemon/product?q=pitch+black+elite+trainer+box&view=grid' },
  { label: 'Pitch Black BB', url: 'https://www.tcgplayer.com/search/pokemon/product?q=pitch+black+booster+bundle&view=grid' },
];

for (const { label, url } of searches) {
  console.log(`\n=== ${label} ===`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(3000);

  const data = await page.evaluate(() => {
    const items = [];
    // TCGPlayer product cards
    document.querySelectorAll('.search-result, [class*="search-result"]').forEach(el => {
      const name = el.querySelector('[class*="productName"], h3')?.textContent?.trim();
      const market = el.querySelector('[class*="marketPrice"], [class*="market-price"]')?.textContent?.trim();
      const listed = el.querySelector('[class*="listedMedianPrice"], [class*="listed"]')?.textContent?.trim();
      const img = el.querySelector('img')?.src;
      if (name) items.push({ name: name.slice(0, 80), market, listed, img: img?.slice(0, 120) });
    });
    return items.slice(0, 4);
  });

  if (data.length) {
    data.forEach(d => {
      console.log('NAME:', d.name);
      console.log('MARKET:', d.market, '| LISTED:', d.listed);
      console.log('IMG:', d.img);
    });
  } else {
    // alternative: grab all text content + images
    const text = await page.evaluate(() => document.body.innerText?.slice(0, 500));
    const imgs = await page.evaluate(() =>
      [...document.querySelectorAll('img[src*="tcgplayer"]')].map(i => i.src).slice(0, 2)
    );
    console.log('TEXT:', text?.slice(0, 200));
    console.log('IMGS:', imgs);
  }
}

await browser.close();
