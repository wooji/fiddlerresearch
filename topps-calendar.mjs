/**
 * topps-calendar.mjs
 * Reusable skill: read Topps release calendar via CDP.
 * Import and call lookupToppsProduct(slugOrLabel) for any Topps research pipeline.
 *
 * Returns: { slug, title, dropDate, unixTs, discordTs, retail, retailNote }
 * If release > today and no retail found → retail = 'TBA'
 */

import { chromium } from 'playwright';
import { execFile }  from 'child_process';
import { promisify } from 'util';
const execP = promisify(execFile);

const CDP_URL   = 'http://127.0.0.1:9222';
const CHROME    = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = 'C:\\Temp\\chrome-debug';

async function ensureCDP() {
  try {
    const { stdout } = await execP('curl', ['-s', '--max-time', '3', `${CDP_URL}/json/version`]);
    if (stdout.includes('Browser')) return; // already live
  } catch (_) {}
  // Launch Chrome with debug port
  const { spawn } = await import('child_process');
  spawn(CHROME, [
    `--remote-debugging-port=9222`,
    `--user-data-dir=${USER_DATA}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: true, stdio: 'ignore' }).unref();
  // Wait for port to bind
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1200));
    try {
      const { stdout } = await execP('curl', ['-s', '--max-time', '2', `${CDP_URL}/json/version`]);
      if (stdout.includes('Browser')) return;
    } catch (_) {}
  }
  throw new Error('CDP failed to bind on port 9222 after Chrome launch');
}

async function fetchCalendar(browser) {
  const ctx  = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://www.topps.com/release-calendar', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000); // JS must hydrate dropDate into DOM
  const html = await page.content();
  await page.close();

  // Extract all { url, dropDate } pairs from hydrated HTML
  const entries = [...html.matchAll(/"url":"([^"]+)","dropDate":"([^"]+)"/g)]
    .map(m => ({ slug: m[1], dropDate: m[2] }));
  return entries;
}

async function fetchProductPage(browser, productUrl) {
  const ctx  = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  const html = await page.content();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  await page.close();

  // Title: first <h1>
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Price: look for JSON-LD price or visible $ amounts excluding shipping thresholds
  const jsonLdMatch = html.match(/"price"\s*:\s*"?([\d.]+)"?/);
  const priceMatches = [...html.matchAll(/\$(\d{2,4}(?:\.\d{2})?)/g)]
    .map(m => parseFloat(m[1]))
    .filter(p => p >= 20 && p <= 2000);
  // Exclude Topps free-shipping threshold ($100) and common noise
  const NOISE = new Set([100, 1, 5, 10, 12, 20, 32, 34, 50]);
  const cleanPrices = priceMatches.filter(p => !NOISE.has(p));

  let retail = null;
  if (jsonLdMatch) {
    retail = parseFloat(jsonLdMatch[1]);
  } else if (cleanPrices.length) {
    // Most common price = likely MSRP
    const freq = {};
    cleanPrices.forEach(p => freq[p] = (freq[p] || 0) + 1);
    retail = parseFloat(Object.entries(freq).sort((a,b) => b[1]-a[1])[0][0]);
  }

  return { title, retail, rawText: text.slice(0, 2000) };
}

/**
 * Main export: look up a Topps product on the release calendar.
 * @param {string} slugOrLabel  - URL slug fragment OR product name keyword (e.g. 'topps-chrome-marvel', 'basketball')
 * @param {string} [productUrl] - Optional: direct Topps product page URL for retail lookup
 * @returns {{ slug, title, dropDate, unixTs, discordTs, retail, retailNote }}
 */
export async function lookupToppsProduct(slugOrLabel, productUrl = null) {
  await ensureCDP();

  const browser  = await chromium.connectOverCDP(CDP_URL);
  let result     = null;

  try {
    const entries = await fetchCalendar(browser);
    const needle  = slugOrLabel.toLowerCase().replace(/\s+/g, '-');
    // Match: exact slug or slug contains needle
    const match   = entries.find(e => e.slug.toLowerCase().includes(needle))
                 || entries.find(e => needle.split('-').every(w => e.slug.toLowerCase().includes(w)));

    const now = Date.now();

    if (match) {
      const iso     = match.dropDate;
      const unixTs  = Math.floor(new Date(iso).getTime() / 1000);
      const isFuture = new Date(iso).getTime() > now;

      let retail = null, title = '', retailNote = '';

      if (productUrl) {
        const pg = await fetchProductPage(browser, productUrl);
        retail   = pg.retail;
        title    = pg.title;
      }

      if (!retail && isFuture) {
        retail     = null;
        retailNote = 'TBA — release in future, no retail price on page';
      }

      result = {
        slug:        match.slug,
        title,
        dropDate:    iso,
        unixTs,
        discordTs:   `<t:${unixTs}:F> (<t:${unixTs}:R>)`,
        retail,
        retailNote,
        isFuture,
      };
    } else {
      // Product not yet on calendar
      result = {
        slug:      null,
        title:     '',
        dropDate:  null,
        unixTs:    null,
        discordTs: 'TBA',
        retail:    null,
        retailNote:'Not found on release calendar — may not be listed yet',
        isFuture:  true,
      };
      console.warn(`[topps-calendar] No match for "${slugOrLabel}" in ${entries.length} calendar entries`);
      if (entries.length) console.log('[topps-calendar] Available entries:', entries.map(e => e.slug));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return result;
}

// CLI usage: node topps-calendar.mjs <slug-fragment> [productUrl]
if (process.argv[1].endsWith('topps-calendar.mjs')) {
  const [,, slug, url] = process.argv;
  if (!slug) { console.error('Usage: node topps-calendar.mjs <slug-fragment> [productPageUrl]'); process.exit(1); }
  const res = await lookupToppsProduct(slug, url || null);
  console.log(JSON.stringify(res, null, 2));
}
