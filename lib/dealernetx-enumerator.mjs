/**
 * DealernetX comprehensive enumerator
 * Logs in + navigates categories + extracts all products with pagination
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const BASE_DX = 'https://www.dealernetx.com';

async function dxLogin() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE_DX}/login.php`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(({ user, pass }) => {
    document.querySelector('input[name="userName"]').value = user;
    document.querySelector('input[name="userPass"]').value = pass;
    document.querySelector('button[name="loginBtn"]').click();
  }, { user: env.DEALERNET_USER, pass: env.DEALERNET_PASS });
  await page.waitForTimeout(2500);
  return { browser, page };
}

export class DealernetXEnumerator {
  constructor() {
    this.baseUrl = BASE_DX;
  }

  /**
   * Enumerate all products in a category (with pagination)
   * Returns: { products: [{name, upc, url, price, qty}], totalCount }
   */
  async enumerateCategory(categoryId, subcategoryId = null) {
    const { browser, page } = await dxLogin();
    const products = [];
    const seen = new Set();

    try {
      let pageNum = 1;
      let hasMore = true;

      while (hasMore && pageNum <= 100) {
        // Build URL: listings.php?categoryid=X&subcategoryid=Y&listingtypeid=2&page=N
        let url = `${this.baseUrl}/listings.php?categoryid=${categoryId}&listingtypeid=2&page=${pageNum}`;
        if (subcategoryId) url += `&subcategoryid=${subcategoryId}`;

        console.log(`    [page ${pageNum}] fetching...`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

        // Extract product rows
        const pageProducts = await page.evaluate(() => {
          const results = [];
          const rows = document.querySelectorAll('tr[data-product-id], tr.product-row');

          rows.forEach(row => {
            const nameEl = row.querySelector('[data-product-name], td:nth-child(2)');
            const priceEl = row.querySelector('[data-price], td:nth-child(4)');
            const qtyEl = row.querySelector('[data-qty], td:nth-child(5)');
            const linkEl = row.querySelector('a[href*="/products/"]');

            if (nameEl) {
              results.push({
                name: nameEl.textContent.trim(),
                price: priceEl ? parseFloat(priceEl.textContent.replace(/[\$,]/g, '')) : null,
                qty: qtyEl ? parseInt(qtyEl.textContent) : null,
                url: linkEl ? linkEl.href : null,
              });
            }
          });

          return results;
        });

        if (pageProducts.length === 0) {
          hasMore = false;
          break;
        }

        pageProducts.forEach(p => {
          if (!seen.has(p.name)) {
            products.push(p);
            seen.add(p.name);
          }
        });

        console.log(`      + ${pageProducts.length} products (total: ${products.length})`);
        pageNum++;

        // Check for next button
        const nextExists = await page.evaluate(() => {
          const nextBtn = document.querySelector('a[rel="next"], button:has-text("Next")');
          return !!nextBtn;
        }).catch(() => false);

        if (!nextExists) hasMore = false;
      }

      return { products, totalCount: products.length };
    } finally {
      await browser.close();
    }
  }

  /**
   * Discover all sports card categories on DealernetX
   * Returns: { categoryId: { name, subcategories: [...] } }
   */
  async discoverSportsCategories() {
    const { browser, page } = await dxLogin();
    const categories = {};

    try {
      // Navigate to main browse page
      await page.goto(`${this.baseUrl}/listings.php`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Extract category selector
      const cats = await page.evaluate(() => {
        const options = document.querySelectorAll('select[name="categoryid"] option');
        const result = {};

        options.forEach(opt => {
          const id = opt.value;
          const name = opt.textContent.trim();

          // Filter to sports + TCG
          if (/baseball|basketball|football|soccer|topps|panini|pokemon|magic|lorcana/i.test(name)) {
            result[id] = { name, id };
          }
        });

        return result;
      });

      return cats;
    } finally {
      await browser.close();
    }
  }

  /**
   * Search with pagination (unlike wholesaleSearch which caps at ~5 results)
   */
  async searchWithPagination(query, maxPages = 50) {
    const { browser, page } = await dxLogin();
    const products = [];
    const seen = new Set();

    try {
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const url = `${this.baseUrl}/search.php?keywordsearch=${encodeURIComponent(query)}&page=${pageNum}`;
        console.log(`    [page ${pageNum}] searching for "${query}"...`);

        await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });

        const pageProducts = await page.evaluate(() => {
          const results = [];
          const links = document.querySelectorAll('a[href*="/products/"]');

          links.forEach(link => {
            const name = link.textContent.trim();
            if (name && name.length > 5) {
              results.push({
                name,
                url: link.href,
              });
            }
          });

          return results;
        });

        if (pageProducts.length === 0) break;

        pageProducts.forEach(p => {
          if (!seen.has(p.name)) {
            products.push(p);
            seen.add(p.name);
          }
        });

        console.log(`      + ${pageProducts.length} products (total: ${products.length})`);

        // Check for next
        const hasNext = await page.evaluate(() => {
          return !!document.querySelector('a[rel="next"]');
        }).catch(() => false);

        if (!hasNext) break;
      }

      return products;
    } finally {
      await browser.close();
    }
  }
}
