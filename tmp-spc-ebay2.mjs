import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const rawProxies = readFileSync('proxies-mobilemix.txt', 'utf8').trim().split('\n').filter(Boolean);
const proxies = rawProxies.map(line => {
  const [host, port, user, pass] = line.split(':');
  return { server: `http://${host}:${port}`, username: user, password: pass };
});
const _rp = () => proxies[Math.floor(Math.random() * proxies.length)];

const targets = [
  ['Celebrations UPC',    99.99,  'Celebrations Ultra Premium Collection sealed', '2021-10'],
  ['Crown Zenith UPC',    49.99,  'Crown Zenith Ultra Premium Collection sealed box', '2023-01'],
  ['Obsidian Flames SPC', 49.99,  'Obsidian Flames Super Premium Collection sealed', '2023-08'],
  ['Paradox Rift SPC',    49.99,  'Paradox Rift Super Premium Collection sealed', '2023-11'],
  ['Paldean Fates SPC',   59.99,  'Paldean Fates Super Premium Collection sealed', '2024-01'],
  ['151 UPC',            119.99,  '151 Ultra Premium Collection sealed box', '2023-09'],
];

const proxy = _rp();
const browser = await chromium.launch({ headless: true, proxy: { server: proxy.server, username: proxy.username, password: proxy.password } });
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' });

for (const [label, msrp, query, histFrom] of targets) {
  const page = await ctx.newPage();
  const enc = encodeURIComponent(query);
  const url = `https://www.ebay.com/sch/i.html?_nkw=${enc}&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=20`;
  try {
    await page.goto(url, { timeout: 25000, waitUntil: 'domcontentloaded' });
    await page.waitForSelector('li.s-item, li.s-card', { timeout: 8000 }).catch(() => {});
    const prices = await page.$$eval('li.s-item, li.s-card', items =>
      items.map(el => {
        const title = el.querySelector('[class*="title"], h3, .s-item__title')?.textContent?.trim() ?? '';
        const price = el.querySelector('[class*="price"]')?.textContent?.replace(/[^0-9.]/g, '') ?? '';
        return { title, price };
      }).filter(x => x.title && x.title !== 'Shop on eBay')
    );
    const sold = prices
      .filter(x => !/psa|bgs|cgc|graded|lot of|card #/i.test(x.title))
      .map(x => parseFloat(x.price))
      .filter(p => Number.isFinite(p) && p > 30)
      .sort((a, b) => a - b);
    const median = sold.length ? sold[Math.floor(sold.length / 2)] : null;
    const mult = median ? (median / msrp).toFixed(2) : 'n/a';
    console.log(`${label} | n=${sold.length} | median=$${median ?? 'n/a'} | ${mult}× retail | msrp=$${msrp}`);
    if (median) console.log(`  CSV: ${label},Super/Ultra Premium Collection,${msrp},${median},${median},${mult},${mult},${histFrom},spc,Y`);
  } catch (e) {
    console.log(label, 'ERR:', e.message.slice(0, 100));
  }
  await page.close();
}
await browser.close();
