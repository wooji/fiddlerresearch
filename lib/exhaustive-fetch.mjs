/**
 * exhaustive-fetch.mjs
 * HARD RULE: Try every method/proxy combo before giving up.
 * Order: (1) CDP real browser, (2) CDP+proxy, (3) headed Playwright+proxy,
 *        (4) headless Playwright+proxy, (5) curl+proxy
 *
 * Usage:
 *   import { exhaustiveFetch, exhaustivePlaywright } from './lib/exhaustive-fetch.mjs';
 *   const html = await exhaustiveFetch('https://www.topps.com/...');
 *   const page = await exhaustivePlaywright('https://www.topps.com/...', async (page) => page.content());
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/[/\\]lib$/, '');
const execFileAsync = promisify(execFile);

// ── Proxy pool ────────────────────────────────────────────────────────────────
function loadProxies() {
  const f = join(ROOT, 'proxies-mobilemix.txt');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').trim().split('\n')
    .filter(l => l.trim())
    .map(l => { const [host, port, username, password] = l.split(':'); return { host, port, username, password }; });
}

// Provider groups in priority order
function proxyGroups(proxies) {
  return [
    proxies.filter(p => p.username?.startsWith('GRX')),      // Evomi mobile (63.x)
    proxies.filter(p => p.username === 'WoojiWashed'),         // WoojiWashed ISP (89.x/91.x)
    proxies.filter(p => p.username?.startsWith('xyz')),        // Byteful (40.x)
    proxies.filter(p => p.username?.startsWith('DIJ')),        // DIJ
    proxies.filter(p => !['GRX35821','WoojiWashed'].includes(p.username) && !p.username?.startsWith('xyz') && !p.username?.startsWith('DIJ')),
  ].filter(g => g.length > 0);
}

// ISP subnets: WoojiWashed (89/91), Byteful (40), Evomi mobile (63)
function ispProxies(proxies) {
  return proxies.filter(p => {
    const ip = p.host ?? '';
    return ip.startsWith('89.') || ip.startsWith('91.') || ip.startsWith('40.') || ip.startsWith('63.');
  });
}

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── CDP connect to user's local Chrome ────────────────────────────────────────
let _cdpBrowser = null;
export async function getCdpBrowser() {
  if (_cdpBrowser) try { await _cdpBrowser.contexts(); return _cdpBrowser; } catch { _cdpBrowser = null; }
  try {
    const r = await fetch('http://localhost:9222/json/version', { signal: AbortSignal.timeout(2000) }).catch(() => null);
    if (!r?.ok) return null;
    _cdpBrowser = await chromium.connectOverCDP('http://localhost:9222');
    return _cdpBrowser;
  } catch { return null; }
}

// ── Playwright page runner ────────────────────────────────────────────────────
async function playwrightRun(url, fn, { headless = false, proxy = null } = {}) {
  const browser = await chromium.launch({
    headless,
    proxy: proxy ? { server: `http://${proxy.host}:${proxy.port}`, username: proxy.username, password: proxy.password } : undefined,
  });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'en-US', viewport: { width: 1366, height: 900 },
      proxy: proxy ? { server: `http://${proxy.host}:${proxy.port}`, username: proxy.username, password: proxy.password } : undefined,
    });
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
  }
}

// ── curl + proxy ──────────────────────────────────────────────────────────────
async function curlFetch(url, proxy = null) {
  const args = ['-s', '--max-time', '20', '-L',
    '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
    '-H', 'Accept: text/html,application/xhtml+xml,*/*',
    '-H', 'Accept-Language: en-US,en;q=0.9',
  ];
  if (proxy) args.push('--proxy', `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`);
  args.push(url);
  try {
    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 });
    if (!stdout || stdout.includes('Just a moment') || stdout.includes('challenge-platform')) throw new Error('CF challenge');
    return stdout;
  } catch { return null; }
}

/**
 * exhaustiveFetch(url, opts)
 * Returns HTML string or null after exhausting all methods.
 * opts.expectJson — parse + return JSON instead of HTML string
 * opts.skipCdp — skip CDP step (if user's browser not available)
 */
export async function exhaustiveFetch(url, opts = {}) {
  const proxies = loadProxies();
  const groups = proxyGroups(proxies);
  const log = opts.log ?? (() => {});

  // 1. CDP + ISP proxy (user's Chrome browser, routed through ISP subnet for anonymity)
  const cdp = await getCdpBrowser();
  if (cdp && !opts.skipCdp) {
    const isp = ispProxies(loadProxies());
    const ispProxy = isp.length ? randomFrom(isp) : null;
    if (ispProxy) {
      log(`  [try] CDP+ISP ${ispProxy.host}`);
      try {
        const ctx = await cdp.newContext({
          locale: 'en-US', viewport: { width: 1366, height: 900 },
          proxy: { server: `http://${ispProxy.host}:${ispProxy.port}`, username: ispProxy.username, password: ispProxy.password },
        });
        const page = await ctx.newPage();
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (res?.status() < 400) {
          const content = opts.expectJson ? await page.evaluate(() => JSON.parse(document.body.innerText)) : await page.content();
          await page.close();
          log(`  [OK] CDP+ISP`);
          return content;
        }
        await page.close();
      } catch (e) { log(`  [fail] CDP+ISP: ${e.message?.slice(0, 60)}`); }
    }
    // fallback: CDP with user's raw IP
    log('  [try] CDP raw IP');
    try {
      const ctx = await cdp.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } });
      const page = await ctx.newPage();
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (res?.status() < 400) {
        const content = opts.expectJson ? await page.evaluate(() => JSON.parse(document.body.innerText)) : await page.content();
        await page.close();
        log('  [OK] CDP raw IP');
        return content;
      }
      await page.close();
    } catch (e) { log(`  [fail] CDP raw IP: ${e.message?.slice(0, 60)}`); }
  }

  // 3. Headed Playwright + proxy — only when opts.headed=true (e.g. Topps CF Bot Management)
  if (opts.headed) {
    for (const group of groups) {
      const proxy = randomFrom(group);
      log(`  [try] headed Playwright+proxy ${proxy.host}`);
      try {
        const result = await playwrightRun(url, async page =>
          opts.expectJson ? page.evaluate(() => JSON.parse(document.body.innerText)) : page.content(),
          { headless: false, proxy }
        );
        if (result) { log(`  [OK] headed+proxy ${proxy.host}`); return result; }
      } catch (e) { log(`  [fail] headed+proxy ${proxy.host}: ${e.message?.slice(0, 60)}`); }
    }
  }

  // 4. Headless Playwright + each proxy group
  for (const group of groups) {
    const proxy = randomFrom(group);
    log(`  [try] headless Playwright+proxy ${proxy.host}`);
    try {
      const result = await playwrightRun(url, async page =>
        opts.expectJson ? page.evaluate(() => JSON.parse(document.body.innerText)) : page.content(),
        { headless: true, proxy }
      );
      if (result) { log(`  [OK] headless+proxy ${proxy.host}`); return result; }
    } catch (e) { log(`  [fail] headless+proxy ${proxy.host}: ${e.message?.slice(0, 60)}`); }
  }

  // 5. curl + each proxy group
  log('  [try] curl direct');
  const direct = await curlFetch(url);
  if (direct) { log('  [OK] curl direct'); return direct; }

  for (const group of groups) {
    const proxy = randomFrom(group);
    log(`  [try] curl+proxy ${proxy.host}`);
    const result = await curlFetch(url, proxy);
    if (result) { log(`  [OK] curl+proxy ${proxy.host}`); return result; }
  }

  log('  [EXHAUSTED] all methods failed');
  return null;
}

/**
 * exhaustivePlaywright(url, fn, opts)
 * Like exhaustiveFetch but passes the Playwright page object to fn() for custom interactions.
 * fn(page) => any return value
 */
/**
 * opts.headed — if true, try headed Playwright before headless (use for sites like Topps that need real GUI).
 *              Default false — skips headed entirely (no desktop window spam).
 */
export async function exhaustivePlaywright(url, fn, opts = {}) {
  const proxies = loadProxies();
  const groups = proxyGroups(proxies);
  const log = opts.log ?? (() => {});

  // 1. CDP + ISP proxy (user's Chrome, routed through ISP subnet; fallback to raw IP)
  const cdp = await getCdpBrowser();
  if (cdp && !opts.skipCdp) {
    const allProxies = loadProxies();
    const isp = ispProxies(allProxies);
    for (const proxyOpt of [isp.length ? randomFrom(isp) : null, null]) {
      const label = proxyOpt ? `CDP+ISP ${proxyOpt.host}` : 'CDP raw IP';
      log(`  [try] ${label}`);
      try {
        const ctxOpts = { locale: 'en-US', viewport: { width: 1366, height: 900 } };
        if (proxyOpt) ctxOpts.proxy = { server: `http://${proxyOpt.host}:${proxyOpt.port}`, username: proxyOpt.username, password: proxyOpt.password };
        const ctx = await cdp.newContext(ctxOpts);
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const result = await fn(page);
        await page.close();
        log(`  [OK] ${label}`);
        return result;
      } catch (e) { log(`  [fail] ${label}: ${e.message?.slice(0, 60)}`); }
    }
  }

  // 2. Headed Playwright + proxy — ONLY when caller explicitly opts in (Topps, BlowoutForums, etc.)
  if (opts.headed) {
    for (const group of groups) {
      const proxy = randomFrom(group);
      log(`  [try] headed+proxy ${proxy.host}`);
      try {
        const result = await playwrightRun(url, fn, { headless: false, proxy });
        if (result !== undefined) { log(`  [OK] headed+proxy ${proxy.host}`); return result; }
      } catch (e) { log(`  [fail] headed+proxy ${proxy.host}: ${e.message?.slice(0, 60)}`); }
    }
  }

  // 3. Headless + each proxy group (no desktop window)
  for (const group of groups) {
    const proxy = randomFrom(group);
    log(`  [try] headless+proxy ${proxy.host}`);
    try {
      const result = await playwrightRun(url, fn, { headless: true, proxy });
      if (result !== undefined) { log(`  [OK] headless+proxy ${proxy.host}`); return result; }
    } catch (e) { log(`  [fail] headless+proxy ${proxy.host}: ${e.message?.slice(0, 60)}`); }
  }

  log('  [EXHAUSTED] all Playwright methods failed');
  return null;
}

/**
 * toppsShopifyProducts(collectionHandle, opts)
 * Fetch Topps collection products using full exhaustion sequence.
 * Returns array of {title, price, handle} or null.
 */
export async function toppsShopifyProducts(collectionHandle, opts = {}) {
  const url = `https://www.topps.com/collections/${collectionHandle}/products.json?limit=50`;
  const log = opts.log ?? console.log;
  log(`[topps] fetching /collections/${collectionHandle}/products.json`);
  const data = await exhaustiveFetch(url, { expectJson: true, headed: true, log });
  if (!data) return null;
  const products = Array.isArray(data) ? data : data.products ?? [];
  return products.map(p => ({
    title: p.title,
    handle: p.handle,
    price: parseFloat(p.variants?.[0]?.price ?? '0'),
    available: p.variants?.[0]?.available ?? false,
    image: p.images?.[0]?.src ?? null,
  }));
}
