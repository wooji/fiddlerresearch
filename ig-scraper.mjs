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

function extractPosts(edges = []) {
  return edges.map(e => {
    const n = e.node;
    if (!n) return null;
    return {
      id: n.pk || n.id,
      code: n.code,
      timestamp: n.taken_at ? new Date(n.taken_at * 1000).toISOString() : null,
      caption: n.caption?.text || '',
      likes: n.like_count || 0,
      comments: n.comment_count || 0,
      mediaType: n.media_type === 1 ? 'photo' : n.media_type === 2 ? 'video' : 'carousel',
      url: n.code ? `https://www.instagram.com/p/${n.code}/` : null,
    };
  }).filter(Boolean);
}

export async function scrapeIgProfile(username, postLimit = 12) {
  const env = loadEnv();
  const sessionId = decodeURIComponent(env.INSTAGRAM_SESSION_ID || '');
  const csrfToken = env.INSTAGRAM_CSRFTOKEN || '';
  const userId = sessionId.split(':')[0];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  await ctx.addCookies([
    { name: 'sessionid', value: sessionId, domain: '.instagram.com', path: '/' },
    { name: 'csrftoken', value: csrfToken, domain: '.instagram.com', path: '/' },
    { name: 'ds_user_id', value: userId, domain: '.instagram.com', path: '/' },
  ]);

  const page = await ctx.newPage();
  const posts = [];

  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/graphql/query')) return;
    try {
      const text = await res.text();
      if (!text.includes('"code"') || !text.includes('"taken_at"')) return;
      const json = JSON.parse(text);
      // walk all nested keys looking for edges arrays with post nodes
      const findEdges = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj.edges) && obj.edges[0]?.node?.code) {
          posts.push(...extractPosts(obj.edges));
        }
        for (const v of Object.values(obj)) findEdges(v);
      };
      findEdges(json?.data);
    } catch {}
  });

  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle', timeout: 35000 });
  await browser.close();

  // dedupe by id
  const seen = new Set();
  const unique = posts.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  return { username, posts: unique.slice(0, postLimit) };
}

// CLI — only run when executed directly
const isMain = process.argv[1]?.replace(/\\/g,'/').endsWith('ig-scraper.mjs');
if (isMain && process.argv[2]) {
  const handle = process.argv[2].replace('@', '');
  console.log(`Scraping @${handle}...`);
  const result = await scrapeIgProfile(handle);
  console.log(`\nPosts captured: ${result.posts.length}`);
  result.posts.forEach((p, i) => {
    console.log(`\n[${i+1}] ${p.timestamp} | ${p.likes} likes | ${p.mediaType}`);
    console.log(`  URL: ${p.url}`);
    console.log(`  Caption: ${p.caption.slice(0, 200)}`);
  });
}
