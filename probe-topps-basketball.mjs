import { chromium } from 'playwright';

async function run() {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const ctx = browser.contexts()[0] || await browser.newContext();
    const page = await ctx.newPage();

    // First get release calendar for the date
    console.log('=== RELEASE CALENDAR ===');
    await page.goto('https://www.topps.com/release-calendar', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const calHtml = await page.content();
    // Find chrome updates basketball entry
    const calMatch = calHtml.match(/chrome[^<]{0,60}update[^<]{0,60}basketball[^<]{0,200}/gi);
    console.log('Calendar matches:', calMatch);
    // Also dump all dropDate lines near basketball
    const dropLines = [...calHtml.matchAll(/"dropDate":"([^"]+)"/g)].map(m => m[1]);
    console.log('All dropDates found:', dropLines.slice(0, 30));
    // Find product entries with dropDate
    const prodEntries = [...calHtml.matchAll(/"url":"([^"]+)","dropDate":"([^"]+)"/g)].map(m => ({url: m[1], dropDate: m[2]}));
    const bball = prodEntries.filter(e => e.url.toLowerCase().includes('basketball') || e.url.toLowerCase().includes('chrome-update'));
    console.log('Basketball entries:', JSON.stringify(bball, null, 2));

    // Now get product page
    console.log('\n=== PRODUCT PAGE ===');
    await page.goto('https://www.topps.com/pages/topps-chrome-updates-basketball', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    const html = await page.content();
    // Extract text blocks
    const textBlocks = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 8000);
    console.log('Page text (first 8000 chars):', textBlocks);

    // Look for price
    const priceMatch = html.match(/\$[\d,]+\.?\d{0,2}/g);
    console.log('Prices found:', [...new Set(priceMatch)]);

    // Look for JSON-LD
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLd) console.log('JSON-LD:', jsonLd.map(s => s.slice(0, 500)));

    await page.close();
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
run();
