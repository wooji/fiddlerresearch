import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// TCGPlayer AH ETB product page — real market price + sales data
console.log('=== TCGPLAYER: AH ETB market ===');
await page.goto('https://www.tcgplayer.com/product/668496/pokemon-me-ascended-heroes-ascended-heroes-elite-trainer-box', {
  waitUntil: 'domcontentloaded', timeout: 25000
});
await page.waitForTimeout(4000);
const tcgText = await page.evaluate(() => document.body.innerText);
// Find market price, low, median, high
const priceCtx = tcgText.slice(tcgText.search(/market\s*price|listed\s*median|lowest\s*listing/i) - 50, tcgText.search(/market\s*price|listed\s*median|lowest\s*listing/i) + 500);
console.log('PRICE CTX:', priceCtx.slice(0, 600));

// Also grab sales history section
const salesIdx = tcgText.search(/sale[sd]?\s*history|recent\s*sales|last\s*\d+\s*sales/i);
if (salesIdx > -1) console.log('SALES:', tcgText.slice(salesIdx, salesIdx + 400));

// Grab all $ amounts
const prices = [...tcgText.matchAll(/\$[\d,]+\.?\d*/g)].map(m => m[0]);
console.log('\nAll $ amounts on page:', prices.slice(0, 20).join(', '));

// AH PC ETB for comparison
console.log('\n=== TCGPLAYER: AH PC ETB market ===');
await page.goto('https://www.tcgplayer.com/product/668497/pokemon-me-ascended-heroes-ascended-heroes-pokemon-center-elite-trainer-box-exclusive', {
  waitUntil: 'domcontentloaded', timeout: 20000
});
await page.waitForTimeout(3500);
const pcText = await page.evaluate(() => document.body.innerText);
const pcPrices = [...pcText.matchAll(/\$[\d,]+\.?\d*/g)].map(m => m[0]);
console.log('PC ETB $ amounts:', pcPrices.slice(0, 15).join(', '));

await browser.close();
