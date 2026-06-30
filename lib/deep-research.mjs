/**
 * Fiddler Deep Research — multi-source signal aggregator
 * Returns scored signals for risk computation and writeup enrichment.
 */
import { chromium } from 'playwright';
import { createHmac, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { wholesaleListings, wholesaleSearch, wholesaleByBoxType, DX_BOXTYPES } from './prices.mjs';
import { stockxMarket } from './stockx.mjs';

const _require = createRequire(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Proxy pool for eBay (datacenter IPs always blocked)
const _proxyLines = (() => {
  try { return readFileSync(join(ROOT, 'proxies-mobilemix.txt'), 'utf8').split('\n').map(l => l.trim()).filter(Boolean); }
  catch { return []; }
})();
function _randomProxy() {
  if (!_proxyLines.length) return null;
  const line = _proxyLines[Math.floor(Math.random() * _proxyLines.length)];
  const [host, port, username, password] = line.split(':');
  return { server: `http://${host}:${port}`, username, password };
}

const env  = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

// ── ISP Proxy rotation ────────────────────────────────────────────────────────
function getProxyAgent() {
  if (!env.ISP_PROXY_HOST || !env.ISP_PROXY_PORT) return undefined;
  const octet = Math.floor(Math.random() * 254) + 1; // .1–.254
  const url = `http://${env.ISP_PROXY_USER}:${env.ISP_PROXY_PASS}@${env.ISP_PROXY_HOST}.${octet}:${env.ISP_PROXY_PORT}`;
  return new HttpsProxyAgent(url);
}

// ── Query permutation engine ───────────────────────────────────────────────────
// Generates narrower → broader query variants. Used when a source returns empty.
function queryPermutations(query) {
  const q = query.trim();
  const noYear     = q.replace(/\b20\d{2}\b/g, '').replace(/\s+/g,' ').trim();
  const noBox      = q.replace(/\b(hobby box|hobby|box|blaster|mega|case)\b/gi,'').replace(/\s+/g,' ').trim();
  const noYearBox  = noYear.replace(/\b(hobby box|hobby|box|blaster|mega|case)\b/gi,'').replace(/\s+/g,' ').trim();
  const coreWords  = q.replace(/\b(20\d{2}|topps|hobby box|hobby|box|blaster|entertainment|presale|pre-?order)\b/gi,'').replace(/\s+/g,' ').trim();
  // De-dupe while preserving order
  return [...new Set([q, noBox, noYear, noYearBox, coreWords].filter(Boolean))];
}

// Retry a source fn with permutations until non-empty result
async function withPermutations(fn, query, isEmpty, opts = {}) {
  const { keepWords = [] } = opts;
  const variants = queryPermutations(query).filter(v =>
    keepWords.every(w => v.toLowerCase().includes(w.toLowerCase()))
  );
  for (const v of variants) {
    try {
      const result = await fn(v);
      if (result && !isEmpty(result)) {
        if (v !== query) console.log(`  [permutation hit] "${v}" succeeded (original: "${query}")`);
        return result;
      }
    } catch { /* try next */ }
  }
  console.log(`  [all permutations empty] "${query}" — tried: ${variants.slice(1).map(v=>`"${v}"`).join(', ') || 'none'}`);
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function sentiment(texts) {
  const pos = [
    // action/buy signals
    'fire','buy','cop','grabbed','copping','secure','order','preorder','pre-order','just arrived','arrived',
    'sold out','selling fast','drops','release','releases','limited','exclusive','allocation',
    // hype/excitement
    '🔥','🚀','💰','🤑','bullish','moon','pop','heat','hype','hyped','stoked','excited','amazing','love','want','need',
    // resell signals
    'profit','flip','flipping','resell','reselling','above retail','market price','premium',
    // quality signals
    'clean','strong','demand','scarce','undervalued','worth','legit','insane','crazy good',
    // community buy signals
    'cop it','must have','all in','max out','going hard','run it',
  ];
  const neg = [
    'skip','overpriced','flop','dead','tank','loss','avoid','slow','cooling','dump','overstocked',
    'meh','pass','too expensive','not worth','below retail','tanking','cratered','dead','nope',
    'disappointing','cancelled','cancel','skip it','hard pass','wont buy','won\'t buy',
    '🔴','📉','bust','overhyped','oversupply','mass restock',
  ];
  let score = 0;
  for (const t of texts) {
    const lower = t.toLowerCase();
    pos.forEach(w => { if (lower.includes(w)) score++; });
    neg.forEach(w => { if (lower.includes(w)) score--; });
  }
  return score;
}

// ── Reddit ─────────────────────────────────────────────────────────────────────
export async function redditSignal(query, subredditHint) {
  const shortName = query.replace(/\b(hobby box|hobby|booster box|booster|blaster|blister pack|blister|display|case|presale|pre-?order|sealed|new|\d+ packs?)\b/gi, '').replace(/\s+/g, ' ').trim();
  const sub = subredditHint ?? (() => {
    const hints = { lorcana:'Lorcana', pokemon:'pokemontcg', mtg:'magicTCG', topps:'baseballcards', lego:'lego' };
    return Object.entries(hints).find(([k]) => query.toLowerCase().includes(k))?.[1];
  })();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    const page = await ctx.newPage();
    const q = encodeURIComponent(shortName);
    const url = sub
      ? `https://www.reddit.com/r/${sub}/search/?q=${q}&restrict_sr=1&sort=relevance`
      : `https://www.reddit.com/search/?q=${q}&sort=relevance`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    const titles = await page.$$eval('a[href*="/comments/"]', els =>
      els.map(e => e.textContent?.trim()).filter(t => t && t.length > 10 && !t.includes('http'))
    );
    await browser.close(); browser = null;
    if (!titles.length) return null;
    const seen = new Set();
    const deduped = titles.filter(t => { const k = t.slice(0,60); if (seen.has(k)) return false; seen.add(k); return true; });
    return { mentions: deduped.length, sentiment: sentiment(deduped), posts: deduped.slice(0,15).map(t => ({ title: t.slice(0,120) })) };
  } catch { return null; } finally { if (browser) await browser.close().catch(() => {}); }
}

// ── eBay Browse API ────────────────────────────────────────────────────────────
export async function ebayListings(query) {
  try {
    const tokRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${env.EBAY_APP_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64'),
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    });
    const { access_token } = await tokRes.json();
    // No price floor — return all listings; cross-reference against retail in caller
    const params = new URLSearchParams({ q: query, limit: '50', filter: 'priceCurrency:USD,buyingOptions:{FIXED_PRICE|AUCTION}' });
    const r = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
      headers: { Authorization: `Bearer ${access_token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
    });
    const data = await r.json();
    const items = (data.itemSummaries ?? []).map(i => parseFloat(i.price?.value)).filter(p => p > 0);
    if (!items.length) return null;
    const sorted = [...items].sort((a, b) => a - b);
    return {
      count:  items.length,
      low:    sorted[0],
      high:   sorted.at(-1),
      median: sorted[Math.floor(sorted.length / 2)],
      avg:    +(items.reduce((a, b) => a + b, 0) / items.length).toFixed(2),
    };
  } catch { return null; }
}

// ── eBay SOLD/COMPLETED scrape (real sold velocity + dated comps) ──────────────
// Browse API returns ACTIVE listings only. For true sold velocity we scrape the
// completed-listings HTML, parse each sold DATE, and bucket into 30d / 90d windows.
// ── Blowout Forums ─────────────────────────────────────────────────────────────
export async function blowoutSignal(query) {
  const ses   = process.env.BLOWOUT_INCAP_SES;
  const visid = process.env.BLOWOUT_VISID_INCAP;
  const bsh   = process.env.BLOWOUT_BCSESSIONHASH;
  const bfv   = process.env.BLOWOUT_BCFORUM_VIEW;
  if (!ses || !visid) return null; // no session cookies, skip

  const cookieStr = [
    bfv   ? `bcforum_view=${bfv}` : '',
    bsh   ? `bcsessionhash=${bsh}` : '',
    `incap_ses_439_1282878=${ses}`,
    `visid_incap_1282878=${visid}`,
  ].filter(Boolean).join('; ');

  // Try exact match first, then fuzzy if needed
  for (const exactMatch of [1, 0]) {
    const url = `https://www.blowoutforums.com/search.php?do=process&query=${encodeURIComponent(query)}&titleonly=0&forumchoice[]=0&childforums=1&exactname=${exactMatch}&beforeafter=after&dateline=0&replyless=0&replylimit=0&searchdate=0&beforeafter=after&sortby=dateline&order=descending&showposts=0&perpage=40&action=results`;
    try {
      const res = await fetch(url, {
        headers: {
          'Cookie': cookieStr,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Referer': 'https://www.blowoutforums.com/',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      // Parse thread titles and extract commentary from post previews
      const titleMatches = [...html.matchAll(/<a[^>]+class="[^"]*title[^"]*"[^>]*>(.*?)<\/a>/gi)];
      const threads = titleMatches.slice(0, 20); // up to 20 threads
      if (threads.length < 3) continue; // need at least 3

      // Extract commentary snippets (post previews)
      const commentMatches = [...html.matchAll(/<div[^>]+class="[^"]*preview[^"]*"[^>]*>(.*?)<\/div>/gi)];
      const commentary = commentMatches.slice(0, 15).map(m => m[1].replace(/<[^>]+>/g, ' ').trim().slice(0, 200));
      const commentaryCount = Math.max(commentary.length, threads.length);

      if (commentaryCount < 10 && exactMatch === 1) continue; // try fuzzy if exact has <10

      // Sentiment from all text
      const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
      const pos  = (text.match(/\b(fire|🔥|strong|great|value|hit|gem|rc|rookie|auto|profit|flip|buy|solid|hot|underrated)\b/g) || []).length;
      const neg  = (text.match(/\b(avoid|skip|pass|weak|slow|bleed|dump|garbage|bust|flop|overpriced)\b/g) || []).length;
      const sentiment = pos - neg;
      return { count: commentaryCount, sentiment, url, matchType: exactMatch ? 'exact' : 'fuzzy' };
    } catch { continue; }
  }
  return null;
}

// ── YouTube (yt-dlp search) ────────────────────────────────────────────────────
export async function youtubeSignal(query) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const shortQ = query.replace(/\b(booster box|blister pack|blister|hobby box|hobby|display)\b/gi, '').replace(/\s+/g,' ').trim();
  const searches = [`${shortQ} box break`, `${shortQ} booster opening`, shortQ];
  for (const q of searches) {
    try {
      // Fetch up to 20 results, filter to last 30 days, sort by view count locally
      const cmd = `python -m yt_dlp "ytsearch20:${q.replace(/"/g,"'")}" --print "%(id)s|%(duration)s|%(title)s|%(view_count)s|%(upload_date)s" --no-playlist --no-download --quiet --dateafter 20260526`;
      const { stdout } = await execAsync(cmd, { timeout: 25000, windowsHide: true });
      const lines = stdout.trim().split('\n').filter(l => l.includes('|'));
      if (!lines.length) continue;
      const videos = lines.map(l => {
        const parts = l.split('|');
        const [id, dur, ...rest] = parts;
        const title = rest.slice(0, -2).join('|');
        const views = parseInt(rest[rest.length - 2]) || 0;
        const uploadDate = rest[rest.length - 1];
        return { id, duration: parseInt(dur) || 0, title, views, uploadDate };
      }).filter(v => v.title && v.duration > 60 && v.uploadDate)
        .sort((a, b) => b.views - a.views); // Sort by view count descending

      if (videos.length >= 3) {
        const titles = videos.slice(0, 10).map(v => v.title);
        return { count: videos.length, sentiment: sentiment(titles), videos: videos.slice(0, 10), query: q };
      }
    } catch { continue; }
  }
  return null;
}

export async function ebaySold(query, opts = {}) {
  const _proxy = _randomProxy();
  const browser = await chromium.launch({ headless: true, ...(_proxy ? { proxy: _proxy } : {}) });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'en-US', viewport: { width: 1366, height: 900 },
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const page = await ctx.newPage();
    // Warmup eBay home first — ensures cookies before search
    await page.goto('https://www.ebay.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    // Price floor: if retailFloor set, add _udlo to filter out single-pack noise.
    // Rule: product is a booster BOX — pack prices ($5-20 each) must not distort the median.
    // Floor = max(retailFloor * 0.5, 30) so we never filter out legitimately cheap products.
    const priceFloorParam = opts.retailFloor >= 50
      ? `&_udlo=${Math.max(Math.round(opts.retailFloor * 0.5), 30)}`
      : '';
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_ipg=240&_sop=13${priceFloorParam}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    // Wait for items to render — eBay now lazy-renders via JS (new .s-card DOM)
    await page.waitForSelector('.s-card, li.s-item', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    const rows = await page.evaluate(() => {
      // eBay stuffs supplemental "Results matching fewer words" / related items into the SAME
      // ul.srp-results, far exceeding the real "N results" count and polluting the median with
      // cheaper wrong-SKU junk. Read the count heading and slice to the real first-N results.
      const head = document.querySelector('.srp-controls__count-heading, h1.srp-controls__count-heading')?.textContent ?? '';
      const m = head.match(/([\d,]+)\s+results?/i);
      const N = m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
      // New eBay DOM (2026): items are .s-card divs. Old DOM: li.s-item inside ul.srp-results.
      let items = Array.from(document.querySelectorAll('.srp-results .s-card, ul.srp-results li.s-item'));
      if (!items.length) items = Array.from(document.querySelectorAll('.s-card, li.s-item, li.s-card'));
      // Skip ad placeholders ("Shop on eBay")
      items = items.filter(el => {
        const t = el.querySelector('h3, .s-item__title')?.textContent?.trim() ?? '';
        return t && t !== 'Shop on eBay' && !t.startsWith('ADVERTISEMENT');
      });
      if (N && N > 0 && N < items.length) items = items.slice(0, N);
      return items.map(el => {
        const priceTxt = (el.querySelector('[class*="s-card__price"], .s-item__price, [class*="price"]') ?? el.querySelector('[class*="Amount"]'))?.textContent ?? '';
        const dateTxt  = (el.querySelector('.s-item__title--tag, .s-item__caption, [class*="s-card__caption"], .POSITIVE, [class*="caption"], span[role="heading"]')?.textContent
                          ?? el.textContent.match(/Sold\s+[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}/)?.[0] ?? '');
        return { priceTxt, dateTxt };
      });
    });
    await browser.close();
    const now = Date.now();
    const parsed = rows.map(r => {
      const price = parseFloat((r.priceTxt.match(/\$([\d,]+\.\d{2})/)?.[1] ?? '').replace(/,/g, ''));
      const dm = r.dateTxt.match(/([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/);
      let days = null;
      if (dm) {
        const mon = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(dm[1].slice(0,3).toLowerCase());
        if (mon >= 0) days = (now - Date.UTC(+dm[3], mon, +dm[2])) / 86400000;
      }
      return { price, days };
    }).filter(p => p.price > 0);
    // Price-band filter to drop singles, wrong-product lots, and outlier bundles/cases.
    // Stage 1: drop single-pack noise (< floor×0.5) and gross outliers/multi-box cases (> floor×20).
    // Stage 2: self-anchor to the actual box population — tighten around the provisional median.
    //          A fixed retail×N ceiling clips high-multiple sealed (e.g. EB-01 at ~8-10× MSRP);
    //          anchoring to the data's own median keeps real boxes regardless of multiple.
    const med = arr => { const s = [...arr].sort((a,b)=>a-b); return s.length ? s[Math.floor(s.length/2)] : null; };
    const floor = opts.retailFloor ?? 0;
    let banded = parsed;
    if (floor) {
      const stage1 = parsed.filter(p => p.price >= Math.max(floor * 0.5, 30) && p.price <= floor * 20);
      if (stage1.length >= 3) {
        const pm = med(stage1.map(p => p.price));
        banded = stage1.filter(p => p.price >= pm * 0.4 && p.price <= pm * 2.5);
      } else banded = stage1;
    }
    const use = banded.length ? banded : parsed;
    if (!use.length) return null;
    const dated   = use.filter(p => p.days != null);
    const in30    = dated.filter(p => p.days <= 30);
    const in90    = dated.filter(p => p.days <= 90);
    const allP    = use.map(p => p.price).sort((a,b)=>a-b);
    return {
      count30:  in30.length,
      count90:  in90.length || dated.length,
      median:   med((in30.length ? in30 : in90.length ? in90 : use).map(p => p.price)),
      median30: med(in30.map(p => p.price)),
      low:      allP[0],
      high:     allP.at(-1),
      count:    use.length,
      source:   'ebay-sold-scrape',
    };
  } catch { try { await browser.close(); } catch {} return null; }
}

// ── Whatnot (live-auction sentiment + listing velocity) ────────────────────────
export async function whatnotSignal(query) {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'en-US', viewport: { width: 1366, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(`https://www.whatnot.com/search?query=${encodeURIComponent(query)}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.mouse.wheel(0, 2400).catch(() => {});
    await page.waitForTimeout(2000);
    const titles = await page.evaluate(() => {
      const fromLinks = Array.from(document.querySelectorAll('a[href*="/listing"]')).map(e => e.textContent?.trim());
      const fromAlts  = Array.from(document.querySelectorAll('img[alt]')).map(e => e.alt?.trim())
        .filter(a => a && !/thumbnail for live show/i.test(a));
      return [...new Set([...fromLinks, ...fromAlts])].filter(t => t && t.length > 4 && t.length < 160).slice(0, 40);
    });
    await browser.close();
    if (!titles.length) return null;
    return { posts: titles, count: titles.length, sentiment: sentiment(titles), source: 'whatnot' };
  } catch { try { await browser.close(); } catch {} return null; }
}

// ── BestBuy retail ─────────────────────────────────────────────────────────────
// Fetch retail price + stock from BestBuy by product SKU (alphanumeric from URL).
// URL format: https://www.bestbuy.com/product/{slug}/{sku}
export async function bestBuyRetail(sku) {
  try {
    const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const r = await fetch(`https://www.bestbuy.com/product/x/${sku}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const html = await r.text();
    // __NEXT_DATA__ or structured JSON
    const nextM = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextM) {
      try {
        const d = JSON.parse(nextM[1]);
        const product = d?.props?.pageProps?.productData ?? d?.props?.pageProps?.product;
        if (product) {
          return {
            title:   product.name?.slice(0, 100) ?? null,
            price:   product.regularPrice ?? product.currentPrice ?? null,
            inStock: product.orderable !== false && !/sold out/i.test(html.slice(0, 5000)),
            source:  'bestbuy-next-data',
          };
        }
      } catch { /* fall through */ }
    }
    // Regex fallback — BestBuy renders price in multiple patterns
    const priceM = html.match(/"currentPrice":([\d.]+)/) ?? html.match(/"regularPrice":([\d.]+)/) ?? html.match(/class="priceView-customer-price"[^>]*>\s*<span[^>]*>\$([\d.]+)/);
    const oos    = /sold out|coming soon/i.test(html.slice(0, 8000));
    return priceM ? { price: parseFloat(priceM[1]), inStock: !oos, source: 'bestbuy-html' } : null;
  } catch { return null; }
}

// ── Walmart ────────────────────────────────────────────────────────────────────
// Mobile UA bypasses PerimeterX. Search → first /ip/ link → product page JSON.
const WM_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const WM_HEADERS = { 'User-Agent': WM_UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.5' };

export async function walmartStockById(itemId) {
  try {
    const itemUrl = `https://www.walmart.com/ip/FNF/${itemId}`;
    const prodRes  = await fetch(itemUrl, { headers: WM_HEADERS });
    const prodHtml = await prodRes.text();
    const jsonMatch = prodHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        const data  = JSON.parse(jsonMatch[1]);
        const prod  = data?.props?.pageProps?.initialData?.data?.product;
        if (prod) {
          let price   = prod.priceInfo?.currentPrice?.price ?? null;
          const inStock = prod.availabilityStatus?.toLowerCase() === 'in_stock';
          const title   = prod.name?.slice(0, 100);
          const upc     = prod.upc;
          // If OOS and price looks like a scalper (> $300), scan page for floor price
          if (!inStock && price && price > 300) {
            const allPrices = [...prodHtml.matchAll(/"price":([\d.]+)/g)]
              .map(m => parseFloat(m[1])).filter(p => p > 60 && p < 400).sort((a, b) => a - b);
            if (allPrices.length) price = allPrices[0];
          }
          return { title, price, inStock, upc, url: itemUrl, source: 'walmart-next-data' };
        }
      } catch { /* fall through */ }
    }
    const priceM  = prodHtml.match(/"price":([\d.]+).*?"currencyUnit":"USD"/);
    const price   = priceM ? parseFloat(priceM[1]) : null;
    const inStock = /in_stock/i.test(prodHtml) && !/out_of_stock/i.test(prodHtml);
    return { price, inStock, url: itemUrl, source: 'walmart-html' };
  } catch { return null; }
}

export async function walmartStock(query) {
  try {
    // Step 1 — search, parse __NEXT_DATA__ item cards, pick the BEST token-match to the query
    // (not just the first /ip/ link — that grabs a cheap wrong SKU). Score by query-token overlap.
    const searchRes = await fetch(`https://www.walmart.com/search?q=${encodeURIComponent(query)}`, { headers: WM_HEADERS });
    const searchHtml = await searchRes.text();
    let itemUrl = null, searchMatched = null;
    const sj = searchHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (sj) {
      try {
        const sd = JSON.parse(sj[1]);
        const stacks = sd?.props?.pageProps?.initialData?.searchResult?.itemStacks ?? [];
        const items = stacks.flatMap(s => s.items ?? []).filter(it => it.canonicalUrl && (it.name || it.title));
        const qTokens = query.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        const score = name => { const n = (name || '').toLowerCase(); return qTokens.reduce((s, t) => s + (n.includes(t) ? 1 : 0), 0); };
        const ranked = items
          .map(it => ({ it, sc: score(it.name || it.title), price: it.priceInfo?.currentPrice?.price ?? it.price ?? null }))
          .filter(r => r.sc >= Math.ceil(qTokens.length * 0.6))   // must match ≥60% of query tokens
          .sort((a, b) => b.sc - a.sc || (b.price ?? 0) - (a.price ?? 0));
        if (ranked.length) {
          const best = ranked[0];
          searchMatched = { name: best.it.name || best.it.title, price: best.price, candidates: ranked.slice(0, 3).map(r => ({ name: r.it.name, price: r.price })) };
          itemUrl = best.it.canonicalUrl.startsWith('http') ? best.it.canonicalUrl : 'https://www.walmart.com' + best.it.canonicalUrl;
        }
      } catch { /* fall through to link heuristic */ }
    }
    if (!itemUrl) {
      const allIp = [...searchHtml.matchAll(/\/ip\/([^"'\s?#<]{5,})/g)].map(m => m[0]);
      const boxLink = allIp.find(l => /\b(box|case|hobby|bundle|collection)\b/i.test(l) && !/\d+-\d+/.test(l));
      const firstLink = allIp.find(l => !/\d+-\d+/.test(l)) ?? allIp[0];
      const ipPath = boxLink ?? firstLink;
      if (!ipPath) return null;
      itemUrl = 'https://www.walmart.com' + ipPath.split('/').slice(0, 4).join('/');
    }
    // If the search card gave a confident match, verify live inStock via item page (search API always says inStock=true — unreliable)
    if (searchMatched?.price) {
      const itemIdMatch = itemUrl.match(/\/ip\/(?:[^/]+\/)?(\d+)/);
      if (itemIdMatch) {
        const live = await walmartStockById(itemIdMatch[1]).catch(() => null);
        if (live) return { ...live, source: 'walmart-search-matched+verified', candidates: searchMatched.candidates };
      }
      return { title: searchMatched.name?.slice(0, 100), price: searchMatched.price, inStock: false, url: itemUrl, source: 'walmart-search-matched-unverified', candidates: searchMatched.candidates };
    }

    // Step 2 — product page
    const prodRes  = await fetch(itemUrl, { headers: WM_HEADERS });
    const prodHtml = await prodRes.text();

    // __NEXT_DATA__ JSON has authoritative price + availability
    const jsonMatch = prodHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        const data  = JSON.parse(jsonMatch[1]);
        const prod  = data?.props?.pageProps?.initialData?.data?.product;
        if (prod) {
          const price   = prod.priceInfo?.currentPrice?.price ?? null;
          const inStock = prod.availabilityStatus?.toLowerCase() === 'in_stock';
          const title   = prod.name?.slice(0, 100);
          const upc     = prod.upc;
          return { title, price, inStock, upc, url: itemUrl, source: 'walmart-next-data' };
        }
      } catch { /* fall through */ }
    }

    // Regex fallback
    const priceM  = prodHtml.match(/"price":([\d.]+).*?"currencyUnit":"USD"/);
    const price   = priceM ? parseFloat(priceM[1]) : null;
    const inStock = /in_stock/i.test(prodHtml) && !/out_of_stock/i.test(prodHtml);
    return { price, inStock, url: itemUrl, source: 'walmart-html' };
  } catch { return null; }
}

// ── SigV4 helper for SP-API ────────────────────────────────────────────────────
export function spaSigV4(method, url, extraHeaders) {
  const region    = env.SP_AWS_REGION || 'us-east-1';
  const accessKey = env.SP_AWS_ACCESS_KEY_ID;
  const secretKey = env.SP_AWS_SECRET_ACCESS_KEY;
  const service   = 'execute-api';
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0,15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const u         = new URL(url);
  const canonQS   = [...u.searchParams.entries()].sort().map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const allH      = { ...extraHeaders, host: u.hostname, 'x-amz-date': amzDate };
  const sortedKeys = Object.keys(allH).map(k=>k.toLowerCase()).sort();
  const canonH    = sortedKeys.map(k=>`${k}:${allH[Object.keys(allH).find(h=>h.toLowerCase()===k)]}\n`).join('');
  const signedH   = sortedKeys.join(';');
  const payHash   = createHash('sha256').update('').digest('hex');
  const canonReq  = [method, u.pathname, canonQS, canonH, signedH, payHash].join('\n');
  const credScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${createHash('sha256').update(canonReq).digest('hex')}`;
  const sign      = (key, msg) => createHmac('sha256', key).update(msg).digest();
  const sigKey    = sign(sign(sign(sign(`AWS4${secretKey}`, dateStamp), region), service), 'aws4_request');
  const sig       = createHmac('sha256', sigKey).update(strToSign).digest('hex');
  return { ...allH, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope}, SignedHeaders=${signedH}, Signature=${sig}` };
}

let _spaToken = null;
let _spaTokenExpiry = 0;
export async function getSpaToken() {
  if (_spaToken && Date.now() < _spaTokenExpiry) return _spaToken;
  const r = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.SP_LWA_REFRESH_TOKEN, client_id: env.SP_LWA_CLIENT_ID, client_secret: env.SP_LWA_CLIENT_SECRET }),
  });
  const { access_token, expires_in } = await r.json();
  _spaToken = access_token;
  _spaTokenExpiry = Date.now() + (expires_in - 60) * 1000;
  return access_token;
}

// ── Amazon ─────────────────────────────────────────────────────────────────────
// SP-API catalog search → top ASIN → fetch product page for price/availability
export async function amazonListings(query, opts = {}) {
  try {
    const access_token = await getSpaToken();
    const catalogUrl = `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items?keywords=${encodeURIComponent(query)}&marketplaceIds=ATVPDKIKX0DER&includedData=identifiers,summaries&pageSize=3`;
    const hdrs = spaSigV4('GET', catalogUrl, { 'x-amz-access-token': access_token, 'Content-Type': 'application/json' });
    const r = await fetch(catalogUrl, { headers: hdrs });
    if (!r.ok) return null;
    const data = await r.json();
    const topItem = data.items?.[0];
    if (!topItem) return null;
    const asin  = topItem.asin;
    const title = topItem.summaries?.[0]?.itemName?.slice(0, 100);

    // Fetch product page for price + availability
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
    const asinUrl = `https://www.amazon.com/dp/${asin}`;
    const pageRes = await fetch(asinUrl, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } });
    const pageHtml = await pageRes.text();

    // SP-API offers endpoint — actual prices, not HTML scrape
    // msrp = Summary.ListPrice (Amazon's struck-through retail price)
    // amazonPrice = LowestPrices[fulfillmentChannel="Amazon"] (Amazon as seller)
    // price = lowest 3P offer (market comp)
    let price = null, msrp = null, amazonPrice = null;
    try {
      const offersUrl = `https://sellingpartnerapi-na.amazon.com/products/pricing/v0/items/${asin}/offers?MarketplaceId=ATVPDKIKX0DER&ItemCondition=New`;
      const offHdrs = spaSigV4('GET', offersUrl, { 'x-amz-access-token': access_token, 'Content-Type': 'application/json' });
      const offRes = await fetch(offersUrl, { headers: offHdrs });
      if (offRes.ok) {
        const offData = await offRes.json();
        const summary = offData?.payload?.Summary;
        msrp = summary?.ListPrice?.Amount ?? null;
        amazonPrice = summary?.LowestPrices?.find(p => p.fulfillmentChannel === 'Amazon')?.ListingPrice?.Amount ?? null;
        const offers = offData?.payload?.Offers ?? [];
        const prices = offers.map(o => o.ListingPrice?.Amount).filter(p => p > 0).sort((a, b) => a - b);
        if (prices.length) price = prices[0];
      }
    } catch { /* fall through to HTML scrape */ }

    // Fallback: HTML scrape filtered by retail floor
    if (!price) {
      const retailFloor = opts.retailFloor ?? 0;
      const allPrices = [...pageHtml.matchAll(/class="a-offscreen">\$?([\d,]+\.\d{2})</g)]
        .map(m => parseFloat(m[1].replace(/,/g,'')))
        .filter(p => p > 5 && p < 9999)
        .sort((a, b) => a - b);
      const aboveFloor = allPrices.filter(p => p >= retailFloor * 0.9);
      price = aboveFloor.length ? aboveFloor[0] : (allPrices.length ? allPrices[0] : null);
    }
    const oos    = /currently unavailable|out of stock/i.test(pageHtml) && !/in stock/i.test(pageHtml.slice(0, 5000));
    const prime  = /prime/i.test(pageHtml.slice(0, 3000));
    const reviews = pageHtml.match(/(\d[\d,]+) ratings/)?.[1];

    return { asin, title, price, msrp, amazonPrice, inStock: !oos, prime, reviews, url: asinUrl, source: 'sp-api+fetch' };
  } catch { return null; }
}

// ── Web Search (Bing mobile UA — bypasses CAPTCHA same as Walmart) ────────────
export async function googleSignal(query) {
  const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const allSnippets = [];
  // Bing page 1 + page 2 + forum-targeted search (mobile UA bypasses bot detection)
  const searches = [
    `https://www.bing.com/search?q=${encodeURIComponent(query + ' price resell')}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query + ' price resell')}&first=11`,
    `https://www.bing.com/search?q=${encodeURIComponent(query + ' review forum reddit')}`,
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' price resell')}`,
  ];
  for (const url of searches) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA_MOBILE, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.5' } });
      if (!res.ok) continue;
      const html = await res.text();
      if (/robot|captcha|challenge/i.test(html.slice(0, 500))) continue;
      // Try multiple snippet selectors
      const snippets = [
        ...html.matchAll(/<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/g),
        ...html.matchAll(/<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/g),
        ...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g),
      ].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 250))
       .filter(s => s.length > 20);
      allSnippets.push(...snippets);
    } catch { /* try next */ }
  }
  const deduped = [...new Set(allSnippets)].slice(0, 30);
  return deduped.length ? { snippets: deduped, sentiment: sentiment(deduped), count: deduped.length } : null;
}

// Generate smart Instagram hashtag candidates from a query.
// Keep slugs SHORT — 2-3 words max compound; long compounds get zero engagement.
function igHashtags(query) {
  const stopWords = new Set(['hobby','box','case','blaster','mega','entertainment','presale','pre','order','the','and','for','pokemon','tcg','sealed']);
  const words = query.toLowerCase().replace(/\b20\d{2}\b/g, '').trim().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const year  = query.match(/\b(20\d{2})\b/)?.[1] ?? '';
  const tags  = [
    words.slice(0, 2).join(''),                        // 2-word: "prismaticevolutions", "firstpartner"
    words.slice(0, 3).join(''),                        // 3-word max: "prismaticevolutionscollection"
    words[0],                                          // first key word alone
    'pokemontcg',                                      // always relevant for TCG products
    year ? words.slice(0, 2).join('') + year : null,   // with year: "firstpartner2026"
  ].filter(Boolean);
  return [...new Set(tags)].slice(0, 5);
}

// ── Instagram ──────────────────────────────────────────────────────────────────
export async function instagramSignal(query) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  try {
    await ctx.addCookies([
      { name: 'sessionid', value: decodeURIComponent(env.INSTAGRAM_SESSION_ID ?? ''), domain: '.instagram.com', path: '/' },
      { name: 'csrftoken', value: env.INSTAGRAM_CSRFTOKEN ?? '', domain: '.instagram.com', path: '/' },
    ]);
    const page = await ctx.newPage();
    const tags = igHashtags(query);
    let posts = [];
    for (const tag of tags) {
      await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2500);
      // Scroll to load more posts
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await page.waitForTimeout(800);
      }
      const found = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('article img, ._aagu img, img[alt]')).slice(0, 30);
        return [...new Set(imgs.map(i => i.alt?.trim().slice(0, 200)).filter(Boolean))];
      });
      if (found.length) {
        console.log(`  [instagram] tag #${tag}: ${found.length} posts`);
        posts.push(...found);
      }
    }
    // Also try the search page for posts mentioning the product
    await page.goto(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(igHashtags(query)[0])}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(()=>{});
    await page.waitForTimeout(1500);
    const searchPosts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img[alt]')).slice(0, 20).map(i => i.alt?.trim().slice(0,200)).filter(s => s && s.length > 20);
    });
    posts.push(...searchPosts);
    posts = [...new Set(posts)].slice(0, 40);
    return { posts, sentiment: sentiment(posts), count: posts.length };
  } catch { return null; }
  finally { await browser.close(); }
}

// ── Facebook ───────────────────────────────────────────────────────────────────
export async function facebookSignal(query) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  try {
    await ctx.addCookies([
      { name: 'c_user', value: env.FB_C_USER ?? '', domain: '.facebook.com', path: '/' },
      { name: 'xs',     value: decodeURIComponent(env.FB_XS ?? ''), domain: '.facebook.com', path: '/' },
    ]);
    const page = await ctx.newPage();
    await page.goto(`https://www.facebook.com/search/posts?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3500);
    // Scroll to load more posts (4 passes)
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 2000));
      await page.waitForTimeout(1200);
    }
    const kw = query.toLowerCase().split(' ').filter(w => w.length > 3);
    const posts = await page.evaluate((keywords) => {
      const spans = Array.from(document.querySelectorAll('span[dir="auto"]'))
        .map(e => e.textContent?.trim())
        .filter(t => t && t.length > 40 && t.length < 800 && !t.startsWith('Unread'));
      return [...new Set(spans)].filter(t => keywords.some(w => t.toLowerCase().includes(w))).slice(0, 25);
    }, kw);
    return { posts, sentiment: sentiment(posts), count: posts.length };
  } catch { return null; }
  finally { await browser.close(); }
}

// ── X / Twitter (auth_token cookie injection) ─────────────────────────────────
export async function xSignal(query) {
  const coreQuery = query.replace(/\b(20\d\d|hobby box|hobby|box)\b/gi, '').replace(/\s+/g, ' ').trim();
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
    // Inject auth_token directly — no login flow needed
    await ctx.addCookies([
      { name: 'auth_token', value: env.X_AUTH_TOKEN ?? '', domain: '.x.com', path: '/', httpOnly: true, secure: true },
    ]);
    const page = await ctx.newPage();
    await page.goto(`https://x.com/search?q=${encodeURIComponent(coreQuery)}&f=live&src=typed_query`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3000);

    // Bail if redirected to login
    if (page.url().includes('/login') || page.url().includes('/i/flow')) {
      // Bing fallback
      const bp = await ctx.newPage();
      await bp.goto(`https://www.bing.com/search?q=${encodeURIComponent(coreQuery + ' site:x.com')}&freshness=Week`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await bp.waitForTimeout(1500);
      const snips = await bp.evaluate(() =>
        Array.from(document.querySelectorAll('.b_caption p, .b_algoSlug')).slice(0, 10)
          .map(el => el.textContent?.trim().slice(0, 200)).filter(s => s && s.length > 15)
      );
      return snips.length ? { tweets: snips, sentiment: sentiment(snips), count: snips.length, source: 'bing→x.com' } : null;
    }

    // Scroll to load more tweets (3 scroll passes)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(1200);
    }
    const tweets = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="tweetText"]')).slice(0, 50)
        .map(el => el.textContent?.trim().slice(0, 300)).filter(s => s && s.length > 10)
    );
    return tweets.length ? { tweets, sentiment: sentiment(tweets), count: tweets.length, source: 'x.com' } : null;
  } catch { return null; }
  finally { await browser.close(); }
}

// ── Discord channels ───────────────────────────────────────────────────────────
export async function discordSignal(query, channels = [
  // Guild 663388213964046336 — card-flips, cards-chat, pokemon-investments, tcg-monitor, ravensburger, pokemon-info
  '722968137687105596', '733479809639776407', '735311537337532436', '862416675873751050',
  '1197272871408500806', '1174732587516837898', '1086397161836642320',
  // Guild 667532381376217089 — pokemon-tcg, pokemon-important, unfiltered-cards, card-pulls, card-investments, lorcana, early-upc, x-cards, card-sports, hot-card-restocks
  '744273631638454452', '1247959380704366753', '1247959416897015829', '1329625205513130065',
  '1461808611310440478', '1513866337032601700', '1369357905727455292', '1372576387407286314',
  '1348649989781585991', '1361727285073416222',
  // Guild 1328509555268649051 — member-links, tcg-flex, ptcg-news
  '1328510022023643238', '1328800464430694450', '1329248048999563306',
]) {
  // USER TOKEN DISABLED — account flagged for platform manipulation. Use bot token only.
  const BOT_TOKEN = env.DISCORD_BOT_TOKEN;
  const TOKEN = BOT_TOKEN ? `Bot ${BOT_TOKEN}` : null;
  if (!TOKEN) return null;
  // Generic TCG stop-words — require at least one specific keyword to match
  const stopWords = new Set(['topps', 'panini', '2026', '2025', '2024', 'hobby', 'blaster', 'box', 'case', 'card', 'cards', 'pack', 'packs', 'auto', 'autos']);
  const allKw  = query.toLowerCase().split(' ').filter(w => w.length > 3);
  const specKw = allKw.filter(w => !stopWords.has(w));          // specific words e.g. "disney", "inception", "chrome"
  const kw     = specKw.length ? specKw : allKw;                // fall back to all if no specifics
  // Build sliding 2-word bigrams for phrase matching — prevents single-word noise (e.g. "prismatic" matching all PE content)
  const bigrams = specKw.length >= 2
    ? specKw.slice(0, -1).map((w, i) => w + ' ' + specKw[i + 1])
    : [];
  const matchMsg = (m) => {
    const text = ((m.content ?? '') + ' ' + (m.embeds ?? []).map(e => (e.title ?? '') + ' ' + (e.description ?? '')).join(' ')).toLowerCase();
    if (bigrams.length) return bigrams.some(bg => text.includes(bg));
    return kw.some(w => text.includes(w));
  };
  const allMsgs = [];
  for (const ch of channels) {
    try {
      // Paginate up to 500 messages (5 pages × 100) per channel
      let before = '';
      let totalFetched = 0;
      let chRelevant = 0;
      for (let page = 0; page < 5; page++) {
        const url = `https://discord.com/api/v10/channels/${ch}/messages?limit=100${before ? `&before=${before}` : ''}`;
        const r = await fetch(url, { headers: { Authorization: TOKEN } });
        if (!r.ok) break;
        const msgs = await r.json();
        if (!Array.isArray(msgs) || !msgs.length) break;
        const relevant = msgs.filter(matchMsg);
        chRelevant += relevant.length;
        allMsgs.push(...relevant.map(m => m.content?.slice(0, 300) ?? ''));
        totalFetched += msgs.length;
        before = msgs[msgs.length - 1].id;
        if (msgs.length < 100) break; // no more pages
      }
      console.log(`  [discord] ch ${ch}: ${totalFetched} msgs fetched, ${chRelevant} relevant (keywords: ${kw.join(', ')})`);
    } catch (e) { console.log(`  [discord] ch ${ch} error: ${e.message}`); }
  }
  return { mentions: allMsgs.length, sentiment: sentiment(allMsgs), snippets: allMsgs.slice(0, 5) };
}

// ── Checkout Feed Intel ────────────────────────────────────────────────────────
/**
 * Fetches the last N messages from the 🤖checkout-feed channel.
 * Returns: { checkouts: [{product, price, bot, ts}], productCounts: {name: count},
 *            hotProducts: string[], totalCheckouts: number }
 * Used to detect what the community is actively copping — confirms demand for current product.
 */
export async function feedIntelSignal(limit = 50) {
  const BOT_TOKEN = env.DISCORD_BOT_TOKEN;
  const TOKEN = BOT_TOKEN ? `Bot ${BOT_TOKEN}` : null;
  if (!TOKEN) return null;
  const FEED_CHANNEL = '1516473375143235746';
  try {
    const r = await fetch(`https://discord.com/api/v9/channels/${FEED_CHANNEL}/messages?limit=${limit}`, {
      headers: { Authorization: TOKEN }
    });
    if (!r.ok) return null;
    const msgs = await r.json();
    if (!Array.isArray(msgs)) return null;

    const checkouts = [];
    for (const m of msgs) {
      for (const e of (m.embeds ?? [])) {
        const fields = e.fields ?? [];
        const pf = fields.find(f => f.name === 'Product');
        const pricef = fields.find(f => f.name === 'Price');
        if (!pf) continue;
        // Strip markdown link syntax — Product: [Name](url)
        const productName = pf.value.replace(/\[([^\]]+)\]\([^)]+\)/, '$1').replace(/[`*]/g, '').trim();
        // Skip hash-only entries (obfuscated product names)
        if (/^[a-f0-9]{32}$/.test(productName)) continue;
        checkouts.push({
          product: productName.slice(0, 120),
          price: pricef?.value ?? null,
          bot: m.author?.username ?? 'unknown',
          ts: m.timestamp,
        });
      }
    }

    // Count product mentions
    const productCounts = {};
    for (const c of checkouts) {
      const key = c.product.toLowerCase().slice(0, 80);
      productCounts[key] = (productCounts[key] ?? 0) + 1;
    }
    const hotProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name} (${count}×)`);

    return { checkouts: checkouts.slice(0, 20), productCounts, hotProducts, totalCheckouts: checkouts.length };
  } catch {
    return null;
  }
}

// ── Checklist Signal ───────────────────────────────────────────────────────────
/**
 * Downloads a Topps checklist PDF, parses it, and returns:
 *   boxConfig      — { cardsPerBox, autosPerBox } from product page overview
 *   tiers          — array of { name, count, serials } sorted by scarcity
 *   estimatedBoxes — floor estimate based on lowest serial × subjects
 *   topSerials     — e.g. ['/1', '/5', '/10', '/25', '/49', '/99']
 *
 * pdfUrl — direct PDF URL from Topps product page (probe-odds2 scrapes it)
 * boxConfig — { cardsPerBox, autosPerBox } — pass from product definition
 */
export async function checklistSignal(pdfUrl, boxConfig = { cardsPerBox: 7, autosPerBox: 1 }, knownSerials = null) {
  try {
    const pdfParse = _require('pdf-parse');

    // Download PDF
    const resp = await fetch(pdfUrl);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    const data = await pdfParse(buf);
    const text = data.text;

    // Tier detection — count subjects per insert/auto tier
    const tierPatterns = [
      { name: 'Base Cards',         re: /^BASE CARDS$/m },
      { name: 'Short Prints',       re: /SHORT PRINTS/m },
      { name: 'Auto Patch',         re: /AUTOGRAPH PATCH CARDS/im },
      { name: 'Auto Jumbo Patch',   re: /AUTOGRAPH JUMBO PATCH/im },
      { name: 'Signings / Autos',   re: /INCEPTION SIGNINGS|^INCEPTION AUTO/im },
      { name: 'Bat Knob Sticker',   re: /BAT KNOB/im },
      { name: 'Molecular Autos',    re: /MOLECULAR AUTO/im },
      { name: 'Immersion Autos',    re: /IMMERSION AUTO/im },
      { name: 'Dual Autos',         re: /DUAL AUTO/im },
      { name: 'Triple Autos',       re: /TRIPLE AUTO/im },
      { name: 'Vintage Threads',    re: /VINTAGE THREADS|THREADS AUTO/im },
    ];

    const lines = text.split('\n');
    const tiers = [];
    let currentTier = null;
    let lineCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      const match = tierPatterns.find(t => t.re.test(trimmed));
      if (match) {
        if (currentTier) tiers.push({ name: currentTier, count: lineCount });
        currentTier = match.name;
        lineCount = 0;
      } else if (currentTier && trimmed.length > 5 && !/^[A-Z\s\-\/]+$/.test(trimmed)) {
        lineCount++;
      }
    }
    if (currentTier) tiers.push({ name: currentTier, count: lineCount });

    const filteredTiers = tiers.filter(t => t.count > 0);
    const autoTiers = filteredTiers.filter(t => /auto/i.test(t.name));
    const primaryAutoTier = autoTiers[0];
    const autoSubjects = primaryAutoTier?.count ?? null;

    // Serial structure — use passed knownSerials or fall back to Topps Inception historical standard
    const serials = knownSerials ?? [
      { serial: '/99', label: 'Base Auto' },
      { serial: '/49', label: 'Orange' },
      { serial: '/25', label: 'Gold' },
      { serial: '/10', label: 'Red' },
      { serial: '/5',  label: 'Purple' },
      { serial: '/1',  label: 'Superfractor' },
    ];

    // Print run floor: base auto serial (/99 for Inception) × auto subjects
    const baseSerial = parseInt(serials[0]?.serial?.replace('/', '') ?? 99);
    const estimatedBoxes = autoSubjects ? baseSerial * autoSubjects : null;

    // Total base + SP subject count
    const baseCount = filteredTiers.find(t => /base/i.test(t.name))?.count ?? 0;
    const spCount   = filteredTiers.find(t => /short/i.test(t.name))?.count ?? 0;

    return {
      boxConfig,
      tiers:          filteredTiers,
      serials,
      autoSubjects,
      autoTierName:   primaryAutoTier?.name ?? 'Autos',
      baseSubjects:   baseCount + spCount,
      estimatedBoxes,
    };
  } catch { return null; }
}

// ── Scoring ────────────────────────────────────────────────────────────────────
/**
 * Compute weighted risk score (0–100) and return Low/Medium/High label.
 * Inputs:
 *   profitabilityRoi  — number (percent, e.g. 87)
 *   supplyScore       — 0-25: 25=very limited, 12=moderate, 0=wide/mass restock
 *   signals           — { reddit, x, instagram, facebook, discord, google } from above functions
 */
export function computeRisk({ profitabilityRoi, supplyScore, signals }) {
  // Profitability (0-30)
  const profitPts =
    profitabilityRoi >= 50 ? 30 :
    profitabilityRoi >= 25 ? 22 :
    profitabilityRoi >= 10 ? 14 :
    profitabilityRoi >= 0  ? 6  : 0;

  // Supply (0-25)
  const supplyPts = Math.max(0, Math.min(25, supplyScore ?? 12));

  // Current social demand (0-25): all platforms weighted
  const rawSentiment =
    (signals?.discord?.sentiment   ?? 0) * 1.5 +  // discord = highest signal (buyer community)
    (signals?.reddit?.sentiment    ?? 0) * 1.5 +
    (signals?.x?.sentiment         ?? 0) +
    (signals?.instagram?.sentiment ?? 0) +
    (signals?.facebook?.sentiment  ?? 0) +
    (signals?.google?.sentiment    ?? 0);
  const demandPts = Math.max(0, Math.min(25, 12 + rawSentiment * 2));

  // Supply pressure adjustment: Amazon/Walmart in-stock at retail = price suppressor
  const amazonInStock  = signals?.amazon?.inStock && signals?.amazon?.price && signals.amazon.price <= (signals?.retail ?? Infinity);
  const walmartInStock = signals?.walmart?.inStock;
  const supplyPressure = (amazonInStock ? -3 : 0) + (walmartInStock ? -2 : 0);

  // Mention velocity / future demand (0-20): all platforms + eBay volume
  const totalMentions =
    (signals?.discord?.mentions   ?? 0) * 1.5 +
    (signals?.reddit?.mentions    ?? 0) * 2 +
    (signals?.x?.count            ?? 0) +
    (signals?.instagram?.count    ?? 0) +
    (signals?.facebook?.count     ?? 0);
  const ebayVol    = signals?.ebay?.count ?? 0;
  const futurePts  = Math.max(0, Math.min(20, totalMentions + (ebayVol >= 20 ? 3 : ebayVol >= 5 ? 1 : 0) + supplyPressure));

  const total = profitPts + supplyPts + demandPts + futurePts;

  // A money-LOSING buy is never low risk, no matter how scarce/hyped: secondary
  // below your cost = you lose on entry. Cap the label by ROI so it can't read Low.
  let label = total >= 65 ? '🟢 Low' : total >= 38 ? '🟡 Medium' : '🔴 High';
  if (profitabilityRoi < 0)       label = '🔴 High';                                  // underwater vs cost
  else if (profitabilityRoi < 10 && label === '🟢 Low') label = '🟡 Medium';         // thin margin can't be "Low"

  return { score: total, label, breakdown: { profitPts, supplyPts, demandPts, futurePts } };
}

/**
 * Compute overall play rating from ROI, market multiple, risk score, and demand signals.
 * Returns { rating: 'DBLGREEN'|'GREEN'|'ORANGE'|'RED', reasons: string[] }
 */
export function computeRating({ roi, marketMultiple, riskResult, signals, prod }) {
  const reasons = [];

  // ── Score components (0-100) ────────────────────────────────────────────────

  // 1. ROI (0-40)
  const roiPts =
    roi >= 50 ? 40 :
    roi >= 35 ? 32 :
    roi >= 20 ? 22 :
    roi >= 10 ? 12 :
    roi >= 0  ?  4 : 0;

  // 2. Market multiple vs retail (0-20)
  const multiplePts =
    marketMultiple >= 3.0 ? 20 :
    marketMultiple >= 2.5 ? 16 :
    marketMultiple >= 1.8 ? 11 :
    marketMultiple >= 1.3 ?  6 :
    marketMultiple >= 1.0 ?  2 : 0;

  // 3. Risk (inverted: low risk = high pts) (0-20)
  const riskScore   = riskResult?.score ?? 50; // 0-100, higher = safer
  const riskPts     = Math.round((riskScore / 100) * 20);

  // 4. Social sentiment — all platforms (leading indicator) (0-10)
  const sentimentSum =
    (signals?.reddit?.sentiment    ?? 0) * 1.5 +
    (signals?.x?.sentiment         ?? 0) +
    (signals?.discord?.sentiment   ?? 0) * 1.5 +
    (signals?.instagram?.sentiment ?? 0) +
    (signals?.facebook?.sentiment  ?? 0) +
    (signals?.google?.sentiment    ?? 0);
  const sentimentPts = Math.max(0, Math.min(10, 5 + sentimentSum));

  // 5. Volume / buying pressure — all platforms + eBay (HEAVY = leading indicator) (0-10)
  const totalMentions =
    (signals?.reddit?.mentions    ?? 0) * 2 +
    (signals?.x?.count            ?? 0) +
    (signals?.discord?.mentions   ?? 0) * 1.5 +
    (signals?.instagram?.count    ?? 0) +
    (signals?.facebook?.count     ?? 0);
  const ebayVolume  = signals?.ebay?.count ?? 0;
  const rawVolPts   =
    (totalMentions >= 30 ? 5 : totalMentions >= 10 ? 3 : totalMentions >= 3 ? 1 : 0) +
    (ebayVolume    >= 50 ? 5 : ebayVolume    >= 20 ? 3 : ebayVolume    >= 5  ? 1 : 0);

  // 6. Supply pressure: Amazon/Walmart in-stock at/below retail suppresses secondary price
  const azSuppresses   = signals?.amazon?.inStock  && signals?.amazon?.price  && signals.amazon.price  <= (roi != null ? (signals.amazon.price) : Infinity);
  const walmartSupp    = signals?.walmart?.inStock;
  const supplyPenalty  = (azSuppresses ? -2 : 0) + (walmartSupp ? -1 : 0);

  // 7. DealernetX historical: prior-year trades above retail = demand precedent
  const hwTrades    = signals?.historicalWholesale?.flatMap(p => p.market?.trades ?? []) ?? [];
  const hwAvg       = hwTrades.length ? hwTrades.reduce((s, t) => s + t.price, 0) / hwTrades.length : null;
  const hwBonus     = (hwAvg && roi != null && hwAvg > 0) ? (hwTrades.length >= 10 ? 2 : hwTrades.length >= 3 ? 1 : 0) : 0;

  const volumePts = Math.max(0, Math.min(10, rawVolPts + supplyPenalty + hwBonus));

  const total = roiPts + multiplePts + riskPts + sentimentPts + volumePts;

  // ── Threshold → rating ($10k/drop capital deployment framework) ───────────────
  // Key insight: ROI% alone means nothing if market depth can't absorb the position.
  // Dollar Volume = ebayMedian × sold30 = how much $ moves monthly on eBay.
  // MEGA SEND: ≥40% ROI + dollarVol ≥ $5k/mo  → can deploy + exit $10k in ≤60 days
  // FULL SEND: ≥25% ROI + dollarVol ≥ $1k/mo  → exit in 60-90 days
  // LIGHT SEND:≥15% ROI + dollarVol ≥ $200/mo, OR high ROI + thin depth (size down)
  // NO SEND:   <15% ROI or dollarVol too thin to deploy meaningfully
  const ebayMedianPrice = signals?.ebay?.median ?? 0;
  const ebaySold30      = signals?.ebay?.sold30 ?? 0;
  const dollarVolume    = ebayMedianPrice * ebaySold30; // $ of eBay sold/month

  // DLOM — Discount for Lack of Marketability (Pratt Business Valuation)
  // Thin markets trade at discount to stated price; adjust effective value down.
  const dlom            = ebaySold30 < 5 ? 0.30 : ebaySold30 < 20 ? 0.15 : 0;
  const effectiveMarket = ebayMedianPrice * (1 - dlom);
  const effectiveRoi    = prod?.retail ? ((effectiveMarket * (1 - 0.13) - prod.retail) / prod.retail * 100) : (roi ?? 0);
  // adjRoi: use effectiveRoi when roi is null (retail not verified for display but still estimable for scoring).
  // When dlom penalizes thin markets, take the lower of roi vs effectiveRoi.
  const _safeRoi = roi ?? effectiveRoi;
  const adjRoi = dlom > 0 ? Math.min(_safeRoi, effectiveRoi) : _safeRoi;

  // ── Days-to-exit (capital efficiency) ────────────────────────────────────────
  // How long is $10k locked up? positionSize assumed $10k / retail per unit.
  // daysToExit = $10k / (dollarVolume / 30) → lower = better capital velocity.
  // >180d: heavy cap penalty. 90-180d: moderate. <90d: no penalty.
  const retail10k    = prod?.retail ?? ebayMedianPrice * 0.6; // fallback estimate
  const daysToExit   = dollarVolume > 0 ? Math.round(10000 / (dollarVolume / 30)) : 9999;
  const exitPenalty  =
    daysToExit > 180 ? 'hard'   :   // capital locked >6mo → cap at ORANGE
    daysToExit > 90  ? 'soft'   :   // 3-6mo → suppress DBLGREEN
    'none';

  // ── Reprint probability (thesis durability) ───────────────────────────────────
  // HIGH reprint risk = EVC differentiation value not durable → suppress hold / cap rating
  // Sources: category mechanics (CATEGORY-MECHANICS.md)
  const cat = (prod?.category ?? '').toLowerCase();
  const lbl = (prod?.label ?? '').toLowerCase();
  const isOnePiece  = cat === 'one_piece' || /one.piece|op-?\d{2}/i.test(lbl);
  const isLorcana   = !isOnePiece && (cat === 'other_tcg' || /lorcana|disney lorcana/i.test(lbl));
  const isMTGPlay   = (cat === 'mtg' || /magic|mtg\b/i.test(lbl)) && /play booster|draft booster/i.test(lbl);
  const isBlaster   = /blaster/i.test(lbl);
  const isHobby     = /hobby/i.test(lbl);
  const isSL        = /secret lair/i.test(lbl);
  const isLEGO      = cat === 'lego' || /\blego\b/i.test(lbl);

  // Reprint risk: HIGH = structural reprint likely within 6mo; LOW = fixed print / no reprint
  const reprintRisk =
    isLorcana                      ? 'high'   :  // Ravensburger reprints every chapter <6mo
    isMTGPlay || isBlaster         ? 'high'   :  // open print, continuous restock
    isHobby || isSL || isLEGO     ? 'none'   :  // fixed print / retirement-driven
    'medium';

  // ── Handbook tiering: ROI bands → S+/S/A/B/C/No Send (+ PURPLE volume bump) ──
  // ROI = (Net Profit / Cost of Investment) × 100, DLOM-adjusted for thin markets.
  //   S+      = 150%+     → DBLGREEN (exceptional)
  //   S       = 94.99%+   → DBLGREEN
  //   A       = 50–94.99% → GREEN
  //   B       = 30–49.99% → ORANGE
  //   C       = 10–29.99% → YELLOW
  //   No Send = <9.99%    → RED
  // DLOM reduces max 1 tier from the RAW-ROI tier — capital-lock is a sizing signal,
  // not a NO SEND. E.g. raw A (GREEN) + thin market → floors at B (ORANGE), never RED.
  // PURPLE override: MASSIVE eBay $-volume + ROI ≥ 9% → force into B-tier with a
  // volume caveat (a thin-margin product that moves enormous units is still a play).
  const rawRoi = roi ?? 0;   // unadjusted ROI for tier floor
  const tierRoi = adjRoi;
  const MASSIVE_VOL = 15000;
  const isMassiveVol = dollarVolume >= MASSIVE_VOL;

  // Raw ROI tier (before DLOM)
  const TIER_ORDER = ['No Send','C','B','A','S','S+'];
  const RAW_RATINGS = { 'S+':'DBLGREEN', S:'DBLGREEN', A:'GREEN', B:'ORANGE', C:'YELLOW', 'No Send':'RED' };
  function rawTier(r) {
    if (r >= 150)   return 'S+';
    if (r >= 94.99) return 'S';
    if (r >= 50)    return 'A';
    if (r >= 30)    return 'B';
    if (r >= 10)    return 'C';
    return 'No Send';
  }
  const rawRoiTier = rawTier(rawRoi);
  const adjRoiTier = rawTier(tierRoi);

  // DLOM cap: adj tier can drop at most 1 step below raw tier
  const rawIdx = TIER_ORDER.indexOf(rawRoiTier);
  const adjIdx = TIER_ORDER.indexOf(adjRoiTier);
  const cappedIdx = Math.max(adjIdx, rawIdx - 1);  // max 1-tier drop
  const effectiveTier = TIER_ORDER[cappedIdx];

  let roiTier, rawRating;
  if (isMassiveVol && tierRoi >= 9 && tierRoi < 50) {
    roiTier = 'B'; rawRating = 'PURPLE';
  } else {
    roiTier = effectiveTier;
    rawRating = RAW_RATINGS[effectiveTier];
  }

  // Liquidity floor: near-zero $-volume = uninvestable regardless of band → cap YELLOW.
  // EXEMPT pre-release: no sold volume yet BY DEFINITION.
  const rating = (!prod?.preRelease && rawRating !== 'PURPLE' && dollarVolume < 200 &&
                  (rawRating === 'DBLGREEN' || rawRating === 'GREEN' || rawRating === 'ORANGE'))
    ? 'YELLOW'
    : rawRating;
  const tier = rating === 'YELLOW' && roiTier !== 'C' && rawRating !== 'PURPLE' ? 'C' : roiTier;

  if (roiPts >= 32)            reasons.push(`strong ROI (${roi}%)`);
  if (adjRoi < roi)            reasons.push(`DLOM-adj ROI ${Math.round(adjRoi)}% (thin market -${Math.round(dlom*100)}%)`);
  if (rawRating === 'PURPLE')  reasons.push(`PURPLE volume bump — $${Math.round(dollarVolume).toLocaleString()}/mo eBay volume on ${Math.round(tierRoi)}% ROI`);
  if (multiplePts >= 16)       reasons.push(`${marketMultiple?.toFixed(1)}x multiple`);
  if (volumePts >= 6)          reasons.push('heavy buy volume');
  if (sentimentPts >= 7)       reasons.push('bullish social sentiment');
  if (riskPts <= 8)            reasons.push('elevated risk');
  if (daysToExit < 9999)       reasons.push(`~${daysToExit}d to exit $10k position`);
  if (reprintRisk === 'high')  reasons.push('reprint risk caps thesis');
  if (exitPenalty === 'hard')  reasons.push(`capital locked >180d (thin depth)`);

  return { rating, tier, roiTier: tier, score: total, reasons, daysToExit, reprintRisk, dollarVolume, dlom, adjRoi: Math.round(adjRoi) };
}

/**
 * Derive prior-year query: "2025 Topps Inception Baseball" → "2024 Topps Inception Baseball"
 * Decrements the first 4-digit year found by 1.
 */
function priorYearQuery(query) {
  return query.replace(/\b(20\d{2})\b/, (_, yr) => String(parseInt(yr) - 1));
}

// Extract the product TYPE from a label for DX search.
// DX organizes by product type, so "Prismatic Evolutions Super Premium Collection" → "Super Premium Collection".
// This is more reliable than full-label text search on DX.
function dxProductTypeQuery(query) {
  const PRODUCT_TYPES = [
    'Super Premium Collection',
    'Elite Trainer Box',
    'Booster Bundle Display',
    'Booster Bundle',
    'Booster Box',
    'Special Collection',
    'Premium Collection',
    'Collection Box',
    'Illustration Collection',
    'Heavy Hitters',
  ];
  const lower = query.toLowerCase();
  const type  = PRODUCT_TYPES.find(t => lower.includes(t.toLowerCase()));
  if (type) {
    // Keep up to 2 set-name words before the product type for context
    const idx    = lower.indexOf(type.toLowerCase());
    const before = query.slice(0, idx).trim().split(/\s+/)
      .filter(w => w.length > 3 && !/^(pokemon|tcg|scarlet|violet|sv\d+|\d{4})$/i.test(w))
      .slice(-2).join(' ');
    return (before ? before + ' ' : '') + type;
  }
  // Fallback: strip common prefixes
  return query.replace(/\b(pokemon|tcg|scarlet|violet|sv\d+|sv\w+|\d{4}|box|sealed)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

// ── Target retail ──────────────────────────────────────────────────────────────
// Fetch retail price + stock status from a Target product page by TCIN.
// Uses Playwright (Target is JS-rendered; mobile fetch yields partial data).
export async function targetRetail(tcin) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
    await page.goto(`https://www.target.com/p/-/-/A-${tcin}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3000);
    const data = await page.evaluate(() => {
      const titleEl = document.querySelector('h1[data-test="product-title"], h1');
      const oos     = /out of stock|unavailable/i.test(document.body.innerText);
      // Try multiple selectors; fallback to regex on body text
      const priceSelectors = [
        '[data-test="product-price"]',
        '[data-test="current-price"]',
        '.h-text-bs',
        '[class*="Price"]',
        '[data-test="@web/ProductCard/ProductCardPriceInfo/RegulaPrice"]',
        '[data-test="RegularPrice"]',
        'span[class*="price"]',
      ];
      let priceRaw = null;
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.includes('$')) { priceRaw = el.textContent; break; }
      }
      // Fallback: find first $XX.XX pattern in body text that looks like a retail price
      if (!priceRaw) {
        const m = document.body.innerText.match(/\$(\d{1,3}\.\d{2})/);
        if (m) priceRaw = m[0];
      }
      return {
        title:   titleEl?.textContent?.trim()?.slice(0, 120) ?? null,
        price:   priceRaw ? parseFloat(priceRaw.replace(/[^0-9.]/g, '')) : null,
        inStock: !oos,
      };
    });
    return data?.price ? { ...data, source: 'target-playwright', url: `https://www.target.com/p/-/-/A-${tcin}` } : null;
  } catch { return null; }
  finally { await browser.close(); }
}

export async function deepResearch(query, categoryId = 1561, opts = {}) {
  console.log(`  [deep-research] Running all sources for: "${query}"`);
  const priorQuery = priorYearQuery(query);

  // Query variants from query-builder (passed by fiddler-research via opts)
  const qv = opts.queryVariants ?? { primary: query, variants: [query], reddit: [query], youtube: [query], blowout: query, isTCG: false };

  // isEmpty guards — what counts as "no useful data" for each source
  const noEbay      = r => !r || !r.count || r.count < 2;
  const noWalmart   = r => !r || (r.price == null && !r.inStock);
  const noAmazon    = r => !r || (!r.inStock && !r.price);
  const noTarget    = r => !r || r.price == null;
  const noReddit    = r => !r || r.mentions === 0;
  const noX         = r => !r || r.count === 0;
  const noIg        = r => !r || r.count === 0;
  const noFb        = r => !r || r.count === 0;
  const noGoogle    = r => !r || r.count === 0;
  const noDiscord   = r => !r || r.mentions === 0;
  const noWholesale = r => !r || !r.length;

  // Multi-query fallback: try each variant until we get a non-empty result
  async function tryVariants(fn, isEmpty, variants) {
    for (const v of variants) {
      try {
        const r = await fn(v);
        if (!isEmpty(r)) return r;
        console.log(`    ↳ variant "${v}" empty, trying next…`);
      } catch { /* try next */ }
    }
    return null;
  }

  // Detect product type for DX direct box-type lookup
  const dxProductType = Object.keys(DX_BOXTYPES).find(t => query.toLowerCase().includes(t.toLowerCase()));

  // track() — logs start immediately, logs result/error when promise settles
  const track = (label, fmt, p) => {
    console.log(`  [${label}] fetching…`);
    return p.then(r => {
      const summary = fmt ? fmt(r) : (r != null ? 'ok' : 'N/A');
      console.log(`  [${label}] ${summary}`);
      return r;
    }).catch(e => {
      console.log(`  [${label}] failed: ${e.message?.slice(0, 80)}`);
      throw e;
    });
  };

  const [ebay, ebaySoldR, whatnot, walmart, amazon, target, bestbuy, reddit, x, instagram, facebook, google, discord, wholesale, historicalWholesale, stockx, blowout, youtube] = await Promise.allSettled([
    track('ebay-active',  r => r ? `active ${r.count ?? '?'} listings, median $${r.median ?? '?'}` : 'N/A', withPermutations(ebayListings, query, noEbay)),
    track('ebay-sold',    r => r ? `sold30 ${r.count30 ?? '?'} / sold90 ${r.count90 ?? '?'} | median $${r.median ?? '?'}` : 'N/A', ebaySold(query, { retailFloor: opts.retailFloor })),
    track('whatnot',      r => r ? `${r.count ?? 0} listings, sentiment ${r.sentiment ?? '?'}` : 'N/A', whatnotSignal(query)),
    track('walmart',      r => r ? `$${r.price ?? 'N/A'} (${r.inStock ? 'in stock' : 'OOS'})` : 'N/A', opts.walmartItemId ? walmartStockById(opts.walmartItemId) : withPermutations(walmartStock, query, noWalmart)),
    track('amazon',       r => r ? `$${r.price ?? 'N/A'} (${r.inStock ? 'in stock' : 'OOS'})` : 'N/A', opts.upc ? amazonListings(opts.upc, { retailFloor: opts.retailFloor }) : withPermutations(amazonListings, query, noAmazon)),
    track('target',       r => r ? `$${r.price} (${r.inStock ? 'in stock' : 'OOS'})` : 'N/A', opts.targetTcin ? targetRetail(opts.targetTcin) : Promise.resolve(null)),
    track('bestbuy',      r => r ? `$${r.price}` : 'N/A', opts.bestBuySku ? bestBuyRetail(opts.bestBuySku) : Promise.resolve(null)),
    track('reddit',       r => r ? `${r.mentions ?? 0} mentions, sentiment ${r.sentiment ?? '?'}` : 'N/A',
      tryVariants(q => redditSignal(q, opts.redditSubreddit), noReddit, opts.redditQuery ? [opts.redditQuery, ...qv.reddit] : qv.reddit)),
    track('x',            r => r ? `${r.count ?? 0} tweets, sentiment ${r.sentiment ?? '?'}` : 'N/A', withPermutations(xSignal, query, noX)),
    track('instagram',    r => r ? `${r.count ?? 0} posts` : 'N/A', withPermutations(instagramSignal, query, noIg)),
    track('facebook',     r => r ? `${r.count ?? 0} posts` : 'N/A', withPermutations(facebookSignal, query, noFb)),
    track('google',       r => r ? `${r.count ?? 0} results` : 'N/A', withPermutations(googleSignal, query, noGoogle)),
    track('discord',      r => r ? `${r.mentions ?? 0} mentions` : 'N/A', withPermutations(discordSignal, query, noDiscord)),
    track('dealernetx',   r => r ? `${r.length ?? 0} wholesale results` : 'N/A', wholesaleListings(categoryId)),
    track('dealernetx-hist', r => r ? `${r.length ?? 0} wholesale results` : 'N/A', Promise.resolve().then(async () => {
      if (dxProductType) {
        const direct = await wholesaleByBoxType(dxProductType, categoryId);
        if (direct?.lowestAsk || direct?.factoryCost) return [{ name: dxProductType, market: direct }];
      }
      const dxQuery = opts.dxQuery ?? dxProductTypeQuery(query);
      // Search current year AND prior year, merge results
      const [cur, prior] = await Promise.all([
        wholesaleSearch(dxQuery),
        wholesaleSearch(dxProductTypeQuery(priorQuery)),
      ]);
      const merged = [...(cur ?? []), ...(prior ?? [])];
      if (merged.length) return merged;
      return wholesaleSearch(dxProductTypeQuery(query));
    })),
    track('stockx',       r => r ? `$${r.price ?? 'N/A'} (ask $${r.lowestAsk ?? '?'} / bid $${r.highestBid ?? '?'})` : 'N/A', stockxMarket(query, { retailFloor: opts.retailFloor })),
    track('blowout',      r => r ? `${r.count ?? 0} threads, sentiment ${r.sentiment ?? '?'}` : 'N/A', qv.isTCG ? blowoutSignal(query) : Promise.resolve(null)),
    track('youtube',      r => r ? `${r.count ?? 0} videos, sentiment ${r.sentiment ?? '?'}` : 'N/A', youtubeSignal(query)),
  ]);

  const get = r => r.status === 'fulfilled' ? r.value : null;
  // Merge sold-scrape into ebay signal: prefer SOLD median + add dated 30d/90d counts.
  // Browse-API active listings are the fallback for median/low/high when scrape fails.
  const ebayActive = get(ebay);
  const sold       = get(ebaySoldR);
  const ebayMerged = (ebayActive || sold) ? {
    ...(ebayActive ?? {}),
    median:   sold?.median ?? ebayActive?.median ?? null,
    low:      sold?.low    ?? ebayActive?.low    ?? null,
    high:     sold?.high   ?? ebayActive?.high   ?? null,
    sold30:   sold?.count30 ?? null,
    sold90:   sold?.count90 ?? null,
    soldMedian30: sold?.median30 ?? null,
    activeCount:  ebayActive?.count ?? null,
    soldSource:   sold?.source ?? null,
  } : null;
  return {
    ebay:                ebayMerged,
    whatnot:             get(whatnot),
    walmart:             get(walmart),
    amazon:              get(amazon),
    target:              get(target),
    bestbuy:             get(bestbuy),
    reddit:              get(reddit),
    x:                   get(x),
    instagram:           get(instagram),
    facebook:            get(facebook),
    google:              get(google),
    discord:             get(discord),
    wholesale:           get(wholesale),
    historicalWholesale: get(historicalWholesale),
    stockx:              get(stockx),
    blowout:             get(blowout),
    youtube:             get(youtube),
    priorYearQuery:      priorQuery,
  };
}
