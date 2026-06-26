import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const env = {};
  readFileSync(join(__dir, '.env'), 'utf8').split('\n').forEach(l => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  return env;
}

// Known collector groups — add more as needed
export const FB_GROUPS = {
  hotWheels:    'https://www.facebook.com/groups/hotwheelscollectors',
  hwBuySell:    'https://www.facebook.com/groups/hotwheelsbuysell',
  rlcCollectors:'https://www.facebook.com/groups/redlineclubcollectors',
  monsterHigh:  'https://www.facebook.com/groups/monsterhighcollectors',
  mhBuySell:    'https://www.facebook.com/groups/monsterhighbuysell',
  diecast:      'https://www.facebook.com/groups/diecastcollectors',
};

async function makeBrowser() {
  const env = loadEnv();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  await ctx.addCookies([
    { name: 'c_user', value: env.FB_C_USER, domain: '.facebook.com', path: '/' },
    { name: 'xs', value: decodeURIComponent(env.FB_XS || ''), domain: '.facebook.com', path: '/' },
  ]);
  return { browser, ctx };
}

function extractPostsFromHtml(html) {
  const posts = [];
  // FB renders post text in data-ad-comet-preview or role=article divs
  // Pull all text blocks between "·" timestamp markers
  const articleRe = /"message"\s*:\s*\{"text"\s*:\s*"([^"]{20,1000})"/g;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    try {
      posts.push(m[1].replace(/\\n/g, ' ').replace(/\\u[\dA-F]{4}/gi, c =>
        String.fromCharCode(parseInt(c.replace('\\u',''), 16))));
    } catch {}
  }
  return [...new Set(posts)]; // dedupe
}

/**
 * Search a Facebook group for keyword, return post text snippets.
 * groupUrl: full group URL
 * keyword: search term
 * limit: max posts to return
 */
export async function searchFbGroup(groupUrl, keyword, limit = 10) {
  const { browser, ctx } = await makeBrowser();
  const page = await ctx.newPage();
  const posts = [];

  // intercept GraphQL for post data
  page.on('response', async (res) => {
    if (!res.url().includes('facebook.com/api/graphql')) return;
    try {
      const text = await res.text();
      if (!text.includes('"message"') || !text.includes('"text"')) return;
      const found = extractPostsFromHtml(text);
      posts.push(...found);
    } catch {}
  });

  // go to group search
  const searchUrl = `${groupUrl}?sorting_setting=CHRONOLOGICAL`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // try group search box
  try {
    const searchBtn = await page.$('[aria-label="Search this group"]');
    if (searchBtn) {
      await searchBtn.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(keyword);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
    }
  } catch {}

  // scroll to load more posts
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(1500);
  }

  await browser.close();

  // filter for keyword relevance
  const kw = keyword.toLowerCase();
  const relevant = posts.filter(p => p.toLowerCase().includes(kw) || kw.split(' ').some(w => p.toLowerCase().includes(w)));
  return relevant.slice(0, limit);
}

/**
 * Search across multiple groups at once.
 */
export async function searchAllGroups(keyword, groupKeys = null, limit = 5) {
  const keys = groupKeys || Object.keys(FB_GROUPS);
  const results = {};
  for (const key of keys) {
    try {
      const posts = await searchFbGroup(FB_GROUPS[key], keyword, limit);
      if (posts.length) results[key] = posts;
    } catch (e) {
      results[key] = [`error: ${e.message}`];
    }
  }
  return results;
}

// CLI test — only run when executed directly, not imported
const isMain = process.argv[1]?.replace(/\\/g,'/').endsWith('fb-scraper.mjs');
if (isMain && process.argv[2]) {
  const keyword = process.argv.slice(2).join(' ');
  console.log(`Searching Facebook groups for: "${keyword}"`);
  const results = await searchAllGroups(keyword, ['hotWheels', 'rlcCollectors'], 5);
  for (const [group, posts] of Object.entries(results)) {
    console.log(`\n=== ${group} (${posts.length} posts) ===`);
    posts.forEach((p, i) => console.log(`[${i+1}] ${p.slice(0, 200)}`));
  }
}
