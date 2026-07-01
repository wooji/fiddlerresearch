import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const proxies = readFileSync('proxies-mobilemix.txt', 'utf8').trim().split('\n').filter(Boolean);
const _rp = () => proxies[Math.floor(Math.random() * proxies.length)];

const targets = [
  ['Celebrations UPC',    99.99, 'Pokemon Celebrations Ultra Premium Collection sealed box', '2021-10'],
  ['Crown Zenith UPC',    49.99, 'Pokemon Crown Zenith Ultra Premium Collection sealed box',  '2023-01'],
  ['Obsidian Flames SPC', 49.99, 'Pokemon Obsidian Flames Super Premium Collection sealed',   '2023-08'],
  ['Paradox Rift SPC',    49.99, 'Pokemon Paradox Rift Super Premium Collection sealed',      '2023-11'],
  ['Paldean Fates SPC',   59.99, 'Pokemon Paldean Fates Super Premium Collection sealed',     '2024-01'],
  ['151 UPC',            119.99, 'Pokemon 151 Ultra Premium Collection sealed box',           '2023-09'],
];

const browser = await chromium.launch({ headless: true, proxy: { server: 'http://' + _rp() } });
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });

for (const [label, msrp, query, histFrom] of targets) {
  const page = await ctx.newPage();
  const enc = encodeURIComponent(query);
  const url = `https://www.ebay.com/sch/i.html?_nkw=${enc}&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=20`;
  try {
    await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.s-item, .s-card', { timeout: 6000 }).catch(() => {});
    const prices = await page.$$eval('.s-item, .s-card', items =>
      items.map(el => {
        const title = el.querySelector('[class*="title"], h3')?.textContent?.trim() ?? '';
        const price = el.querySelector('[class*="price"]')?.textContent?.trim() ?? '';
        return { title, price };
      }).filter(x => x.title && x.title !== 'Shop on eBay' && x.price)
    );
    // Filter to sealed (no PSA/BGS graded)
    const sold = prices
      .filter(x => !/psa|bgs|graded|lot of/i.test(x.title))
      .map(x => parseFloat(x.price.replace(/[^0-9.]/g, '')))
      .filter(p => p > 10)
      .sort((a, b) => a - b);
    const median = sold.length ? sold[Math.floor(sold.length / 2)] : null;
    const mult = median ? (median / msrp).toFixed(2) : 'n/a';
    console.log(`${label} | n=${sold.length} | median=$${median ?? 'n/a'} | mult=${mult}× | msrp=$${msrp}`);
    if (median) {
      console.log(`  CSV: ${label},Super Premium/Ultra Premium Collection,${msrp},${median},${median},${mult},${mult},${histFrom},spc,Y`);
    }
  } catch (e) {
    console.log(label, 'ERR:', e.message.slice(0, 80));
  }
  await page.close();
}

await browser.close();
