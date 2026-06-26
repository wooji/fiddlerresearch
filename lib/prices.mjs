/**
 * Fiddler pricing pipeline — TCGPlayer live market + wholesale offer aggregation.
 * Never reference wholesale source names in Discord output.
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

/** Fetch TCGPlayer live market price for a product ID.
 *  Returns { market, low, high, sales } or null on failure. */
export async function tcgPrice(productId) {
  try {
    const r = await fetch(`https://mp-search-api.tcgplayer.com/v2/product/${productId}/details`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.tcgplayer.com/',
      },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data?.result?.[0] ?? data;
    return {
      market: result.marketPrice ?? result.market ?? null,
      low:    result.lowestListingPrice ?? result.low ?? null,
      high:   result.highestListingPrice ?? result.high ?? null,
      sales:  result.numberOfSales ?? result.sales ?? null,
    };
  } catch { return null; }
}

/** Search TCGPlayer for a sealed product by name. Returns { productId, imageUrl, productUrl } or null.
 *  Uses Playwright to scrape rendered search results (TCGPlayer renders client-side). */
// game slug → TCGPlayer URL segment. Add new TCG lines here.
const TCG_URL_SLUG = {
  pokemon:   'pokemon',
  one_piece: 'one-piece-card-game',
  other_tcg: 'disney-lorcana',
  mtg:       'magic',
};

export async function tcgProductSearch(query, { category = 'pokemon' } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const gameSlug = TCG_URL_SLUG[category] ?? TCG_URL_SLUG['pokemon'];
    const page = await browser.newPage();
    const url = `https://www.tcgplayer.com/search/${gameSlug}/sealed-products?q=${encodeURIComponent(query)}&view=grid`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/product/"]')]
        .map(a => a.href)
        .filter(h => h.includes('/product/'))
    );
    await browser.close();
    // For One Piece: prefer booster-box, skip case/pack/sleeved
    const boosterBox = links.find(l => /booster-box/.test(l) && !/case|sleeved/.test(l));
    // For Pokemon: prefer ETB/collection
    const etbLink = links.find(l => /elite-trainer|etb|collection/i.test(l) && !/case|code-card/i.test(l));
    const best = boosterBox ?? etbLink ?? links.find(l => !/case|code-card|sleeved/.test(l)) ?? links[0];
    if (!best) return null;
    const idMatch = best.match(/\/product\/(\d+)\//);
    if (!idMatch) return null;
    const id = idMatch[1];
    return {
      productId:  id,
      imageUrl:   `https://product-images.tcgplayer.com/fit-in/437x437/${id}.jpg`,
      productUrl: `https://www.tcgplayer.com/product/${id}`,
    };
  } catch { await browser.close().catch(() => {}); return null; }
}

/** Fetch TCGPlayer SKU-level price points (more granular — low/high/count).
 *  Returns { low, high, count } or null. */
export async function tcgSkuPrice(skuId) {
  try {
    const r = await fetch('https://mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.tcgplayer.com/',
      },
      body: JSON.stringify({ skuIds: [skuId] }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const item = Array.isArray(data) ? data[0] : data?.results?.[0];
    return {
      low:   item?.lowestPrice ?? null,
      high:  item?.highestPrice ?? null,
      count: item?.priceCount ?? null,
    };
  } catch { return null; }
}

// DealernetX box type IDs — use direct listing.php URL for accurate factory cost per product type
// URL: /listing.php?categoryid=1561&subcategoryid={sub}&boxtypeid={id}&listingtypeid=2
export const DX_BOXTYPES = {
  'Super Premium Collection': { subcategoryid: 46701, boxtypeid: 263 },
  // Add more as discovered: 'Elite Trainer Box', 'Booster Bundle Display', etc.
};

/**
 * Fetch factory cost + current asks for a specific DX product type by boxtypeId.
 * More reliable than text search — goes directly to the product listing page.
 * Returns { factoryCost, lowestAsk, listings: [{ product, qty, unitPrice }] }
 */
export async function wholesaleByBoxType(productType, categoryId = 1561) {
  const boxType = DX_BOXTYPES[productType];
  if (!boxType) return null;
  const { browser, page } = await dxLogin();
  try {
    const url = `${BASE_DX}/listing.php?categoryid=${categoryId}&subcategoryid=${boxType.subcategoryid}&boxtypeid=${boxType.boxtypeid}&listingtypeid=2&year=`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const data = await page.evaluate(() => {
      const money = s => { const m = (s ?? '').match(/\$?([\d,]+\.?\d*)/); return m ? parseFloat(m[1].replace(/,/g,'')) : 0; };
      const tables = Array.from(document.querySelectorAll('table'));
      const header = t => Array.from(t.querySelectorAll('th')).map(h => h.textContent?.toLowerCase()).join(' ');
      const asksT   = tables.find(t => /ask|sale price|asking/.test(header(t)));
      const tradesT = tables.find(t => /^\s*date/.test(header(t)) && /price/.test(header(t)));
      const rows = t => t ? Array.from(t.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(c => c.textContent?.trim())) : [];
      const asks   = rows(asksT).filter(c => c.some(x => /\$/.test(x))).map(c => ({ price: money(c.find(x => /\$/.test(x)) ?? ''), qty: c[2] ?? '' }));
      const trades = rows(tradesT).filter(c => /\$/.test(c[1] ?? '')).map(c => ({ date: c[0] ?? '', price: money(c[1]), qty: c[2] ?? '' }));
      // Factory cost often shown as a label/stat on the page
      const allText = document.body.innerText;
      const fcMatch = allText.match(/factory\s*cost[:\s]*\$?([\d,]+\.?\d*)/i);
      return {
        factoryCost: fcMatch ? parseFloat(fcMatch[1].replace(/,/g,'')) : null,
        lowestAsk:   asks.map(a => a.price).filter(p => p > 0).reduce((m, p) => Math.min(m, p), Infinity) || 0,
        asks:        asks.slice(0, 5),
        trades:      trades.slice(0, 10),
      };
    });
    return data;
  } catch { return null; }
  finally { await browser.close(); }
}

/** Log into DealernetX and return (browser, page). Caller must close browser. */
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

/**
 * Fetch live wholesale listings for a TCG category from the marketplace.
 * categoryId: 1561=Pokemon, 1541=MTG, 1606=OnePiece
 * Returns array of { product, upc, qty, unitPrice, total, dealer, offerId, expires }
 */
export async function wholesaleListings(categoryId = 1561) {
  const { browser, page } = await dxLogin();
  try {
    await page.goto(`${BASE_DX}/listings.php?listingtypeid=2&categoryid=${categoryId}`, {
      waitUntil: 'networkidle', timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const listings = await page.evaluate(() => {
      const results = [];
      const offerRows = document.querySelectorAll('table tr');
      let currentOffer = null;

      offerRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText?.trim().replace(/\s+/g, ' '));
        if (!cells.length) return;

        // Header row: OID | DEALER | CREATED | TOTAL | ...
        if (cells[0]?.match(/^\d{5,}$/) && cells[1]?.includes('from')) {
          currentOffer = {
            offerId: cells[0],
            dealer:  cells[1]?.replace(/^from\s+/i, '').replace(/\s*\(.*\)/, '').trim(),
            total:   cells[3],
            expires: cells[4]?.replace('Expires:', '').trim(),
            status:  cells[5],
            items:   [],
          };
          results.push(currentOffer);
        }
        // Line item row: product | UPC | qty | unitPrice | subtotal
        else if (currentOffer && cells[1]?.match(/^\d{10,}$/) && cells[2]?.match(/^\d+$/)) {
          currentOffer.items.push({
            product:   cells[0]?.replace(/~\s*/g, '').trim().slice(0, 80),
            upc:       cells[1],
            qty:       parseInt(cells[2], 10),
            unitPrice: parseFloat(cells[3]?.replace(/[^0-9.]/g, '') || '0'),
            subtotal:  parseFloat(cells[4]?.replace(/[^0-9.]/g, '') || '0'),
          });
        }
      });

      return results;
    });

    return listings;
  } finally {
    await browser.close();
  }
}

/**
 * Search DealernetX for a keyword query — returns historical/current wholesale offers.
 * Used to pull prior-year pricing (e.g. "2024 Topps Inception" when researching 2025).
 * Returns array of { product, qty, unitPrice, total, dealer, offerId, created, status }
 */
// Parse offer table rows into structured listings
function parseOfferTable(rows) {
  const results = [];
  let currentOffer = null;
  rows.forEach(cells => {
    if (!cells.length) return;
    if (cells[0]?.match(/^\d{5,}$/) && cells[1]?.includes('from')) {
      currentOffer = { offerId: cells[0], dealer: cells[1]?.replace(/^from\s+/i,'').replace(/\s*\(.*\)/,'').trim(), total: cells[3], created: cells[2], expires: cells[4]?.replace('Expires:','').trim(), status: cells[5], items: [] };
      results.push(currentOffer);
    } else if (currentOffer && cells[1]?.match(/^\d{10,}$/) && cells[2]?.match(/^\d+$/)) {
      currentOffer.items.push({ product: cells[0]?.replace(/~\s*/g,'').trim().slice(0,80), upc: cells[1], qty: parseInt(cells[2],10), unitPrice: parseFloat(cells[3]?.replace(/[^0-9.]/g,'')||'0'), subtotal: parseFloat(cells[4]?.replace(/[^0-9.]/g,'')||'0') });
    }
  });
  return results;
}

async function scrapeOfferPage(page, url, query) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(1500);
  // Blocked by pending offer gate?
  if (page.url().includes('pgsmsg') || page.url().includes('pendingin')) return null;

  // Fill keyword search if available
  const kw = page.locator('input[name="keywordsearch"], input[name="filterkeyword"]').first();
  if (await kw.isVisible({ timeout: 3000 }).catch(() => false)) {
    await kw.fill(query);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
  }

  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('table tr'))
      .map(r => Array.from(r.querySelectorAll('td')).map(c => c.innerText?.trim().replace(/\s+/g, ' ')))
  );
  return parseOfferTable(rows);
}

/**
 * Search DealernetX products by keyword (not gated by pending offers).
 * Step 1: /search.php?keywordsearch=<query> → product listing URLs
 * Step 2: /listing.php?... → bid/ask/trade history per product
 * Returns array of { name, upc, url, market: { highestBid, lowestAsk, lastTrade, trades[] } }
 */
export async function wholesaleSearch(query) {
  const { browser, page } = await dxLogin();
  try {
    // Step 1 — product search (bypasses pending offer gate)
    await page.goto(`${BASE_DX}/search.php?keywordsearch=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const products = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tr.product-row')).flatMap(tr => {
        const link = tr.querySelector('a.product-link');
        const name = link?.textContent?.trim() ?? '';
        const href = link?.getAttribute('href') ?? tr.querySelector('a[href*="listing.php"]')?.getAttribute('href') ?? '';
        if (!href) return [];
        const upc = tr.querySelector('td[data-label="UPC"]')?.textContent?.trim() ?? '';
        return [{ name, upc, url: href.startsWith('http') ? href : `https://www.dealernetx.com/${href.replace(/^\//, '')}` }];
      })
    );

    if (!products.length) return [];

    // Step 2 — per-product market data (bid/ask/trade history)
    const results = [];
    for (const prod of products.slice(0, 5)) {
      try {
        await page.goto(prod.url, { waitUntil: 'networkidle', timeout: 20000 });
        const market = await page.evaluate(() => {
          const money = s => { const m = (s ?? '').match(/\$?([\d,]+\.?\d*)/); return m ? parseFloat(m[1].replace(/,/g,'')) : 0; };
          const tables = Array.from(document.querySelectorAll('table'));
          const header = t => Array.from(t.querySelectorAll('th')).map(h => h.textContent?.toLowerCase()).join(' ');
          const bidsT  = tables.find(t => /bid price/.test(header(t)));
          const asksT  = tables.find(t => /ask|sale price|asking/.test(header(t)));
          const tradesT = tables.find(t => /^\s*date/.test(header(t)) && /price/.test(header(t)));

          const rows = t => t ? Array.from(t.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(c => c.textContent?.trim())) : [];
          const bids   = rows(bidsT).filter(c => /\$/.test(c.at(-1) ?? '')).map(c => ({ qty: c[2] ?? '', price: money(c.at(-1)) }));
          const asks   = rows(asksT).filter(c => c.some(x => /\$/.test(x))).map(c => ({ price: money(c.find(x => /\$/.test(x)) ?? ''), qty: c[2] ?? '' }));
          const trades = rows(tradesT).filter(c => /\$/.test(c[1] ?? '')).map(c => ({ date: c[0] ?? '', price: money(c[1]), qty: c[2] ?? '' }));

          const tp = trades.map(t => t.price).filter(p => p > 0);
          return {
            highestBid: bids.reduce((m, b) => Math.max(m, b.price), 0),
            lowestAsk:  asks.map(a => a.price).filter(p => p > 0).reduce((m, p) => Math.min(m, p), Infinity) || 0,
            lastTrade:  trades[0]?.price ?? 0,
            avgTrade:   tp.length ? +(tp.reduce((s,p) => s+p, 0) / tp.length).toFixed(2) : 0,
            tradeHigh:  tp.length ? Math.max(...tp) : 0,
            tradeLow:   tp.length ? Math.min(...tp) : 0,
            tradeCount: trades.length,
            trades:     trades.slice(0, 10),
            bids:       bids.slice(0, 5),
            asks:       asks.slice(0, 5),
          };
        });
        results.push({ ...prod, market });
      } catch { results.push({ ...prod, market: null }); }
    }
    return results;
  } finally {
    await browser.close();
  }
}

/**
 * Full pricing snapshot for a product.
 * Pass tcgProductId (required) and optionally tcgSkuId for SKU-level data.
 * Returns { tcg: { market, low, high, sales }, sku: { low, high, count }, wholesale: [...] }
 */
export async function pricingSnapshot(tcgProductId, tcgSkuId = null, categoryId = 1561) {
  const [tcg, sku, wholesale] = await Promise.all([
    tcgPrice(tcgProductId),
    tcgSkuId ? tcgSkuPrice(tcgSkuId) : Promise.resolve(null),
    wholesaleListings(categoryId),
  ]);
  return { tcg, sku, wholesale };
}
