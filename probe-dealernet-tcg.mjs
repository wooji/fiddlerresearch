import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const USER = process.env.DEALERNET_USER ?? '';
const PASS = process.env.DEALERNET_PASS ?? '';

// WooCommerce login
console.log('=== DEALERNET LOGIN ===');
await page.goto('https://dealernet.com/my-account/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);

const usernameField = await page.$('#username, input[name="username"]');
const passwordField = await page.$('#password, input[name="password"]');
if (usernameField && passwordField) {
  await usernameField.fill(USER);
  await passwordField.fill(PASS);
  const loginBtn = await page.$('button[name="login"], input[name="login"], button[type="submit"]');
  if (loginBtn) await loginBtn.click();
  await page.waitForTimeout(3000);
  console.log('Logged in, URL:', page.url());
} else {
  console.log('No login form found, inputs:', await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, name: i.name }))
  ));
}

// Search Pokemon
console.log('\n--- Pokemon TCG Search ---');
await page.goto('https://dealernet.com/?s=pokemon&post_type=product', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2000);

const products = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('.product, .woocommerce-loop-product__link, li.product').forEach(el => {
    const title = el.querySelector('h2, .woocommerce-loop-product__title, .product-title')?.textContent?.trim();
    const price = el.querySelector('.price, .woocommerce-Price-amount')?.textContent?.trim();
    const sku = el.querySelector('.sku')?.textContent?.trim();
    if (title) items.push({ title: title.slice(0, 80), price: price?.slice(0, 30), sku });
  });
  return items;
});
console.log('Pokemon products:', JSON.stringify(products, null, 2));
if (!products.length) {
  const body = await page.evaluate(() => document.body.innerText?.slice(0, 1000));
  console.log('Page text:', body);
}

// Search trading cards
console.log('\n--- Trading Cards Search ---');
await page.goto('https://dealernet.com/?s=trading+card&post_type=product', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2000);

const tcgProducts = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('.product, li.product').forEach(el => {
    const title = el.querySelector('h2, .woocommerce-loop-product__title')?.textContent?.trim();
    const price = el.querySelector('.price')?.textContent?.trim();
    if (title) items.push({ title: title.slice(0, 80), price: price?.slice(0, 30) });
  });
  return items;
});
console.log('TCG products:', JSON.stringify(tcgProducts, null, 2));

// Check categories
console.log('\n--- Categories ---');
await page.goto('https://dealernet.com/product-category/', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(1500);
const cats = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a')).filter(a => a.href.includes('product-category')).map(a => ({ text: a.textContent.trim(), href: a.href })).slice(0, 30);
});
console.log('Categories:', JSON.stringify(cats, null, 2));

await browser.close();
