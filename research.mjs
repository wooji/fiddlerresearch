/**
 * Fiddler Research Engine
 * Usage: node research.mjs "RLC Ford F100 Teal"
 * Scrapes: OrangeTrackDiecast, Reddit, eBay, Instagram, Facebook, LamleyGroup
 * Outputs: Vision Discord-style writeup
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scrapeIgProfile } from './ig-scraper.mjs';
import { searchAllGroups } from './fb-scraper.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const env = {};
  readFileSync(join(__dir, '.env'), 'utf8').split('\n').forEach(l => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  return env;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ── Sources ──────────────────────────────────────────────────────────────────

async function scrapeOrangeTrack(query) {
  try {
    const r = await fetch('https://orangetrackdiecast.com/upcoming-sales/', { headers: { 'User-Agent': UA } });
    const html = await r.text();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const words = query.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 2);
    // split on list separators, find entries containing any keyword
    const entries = text.split(/(?=\w+ \d+, 20\d\d)/);
    const relevant = entries.filter(s => words.filter(w => s.toLowerCase().includes(w)).length >= 2);
    return relevant.slice(0, 5).map(s => {
      // strip ad/script junk after "Advertisements" or "window."
      const cut = s.search(/Advertisements|window\.|Tentative/);
      return (cut > 0 ? s.slice(0, cut) : s).trim().replace(/&amp;/g,'&').replace(/&#\d+;/g,"'");
    }).filter(s => s.length > 10);
  } catch { return []; }
}

async function scrapeReddit(query) {
  try {
    const subs = ['HotWheels', 'HotWheelsRLC', 'Diecast', 'MonsterHigh', 'Pokemoncardcollectors'];
    const results = [];
    for (const sub of subs) {
      const url = `https://reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&sort=new&limit=5&restrict_sr=1`;
      const r = await fetch(url, { headers: { 'User-Agent': 'fiddler-research/1.0' } });
      if (!r.ok) continue;
      const j = await r.json();
      const posts = j?.data?.children || [];
      for (const p of posts) {
        const d = p.data;
        results.push({ sub, title: d.title, score: d.score, url: `https://reddit.com${d.permalink}`, selftext: (d.selftext || '').slice(0, 300) });
      }
      await new Promise(r => setTimeout(r, 600)); // rate limit
    }
    return results;
  } catch { return []; }
}

async function scrapeEbay(query) {
  const env = loadEnv();
  // If eBay App ID available, use Finding API
  if (env.EBAY_APP_ID) {
    try {
      const url = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${env.EBAY_APP_ID}&RESPONSE-DATA-FORMAT=JSON&keywords=${encodeURIComponent(query)}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&paginationInput.entriesPerPage=10&sortOrder=EndTimeSoonest`;
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      const j = await r.json();
      const items = j?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
      return items.map(i => ({
        title: i.title?.[0],
        price: parseFloat(i.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0),
        date: i.listingInfo?.[0]?.endTime?.[0],
        url: i.viewItemURL?.[0],
      }));
    } catch { return []; }
  }
  // Fallback: scrape eBay sold listings HTML
  try {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sacat=0`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await r.text();
    const prices = [];
    const priceRe = /\$([0-9,]+\.?\d*)/g;
    const soldRe = /Sold\s+(?:[\w\s,]+)\s+\$([0-9,]+\.?\d*)/g;
    let m;
    while ((m = soldRe.exec(html)) !== null) prices.push(parseFloat(m[1].replace(',', '')));
    if (!prices.length) while ((m = priceRe.exec(html)) !== null && prices.length < 20) prices.push(parseFloat(m[1].replace(',', '')));
    const valid = prices.filter(p => p > 1 && p < 10000);
    if (!valid.length) return [];
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    return [{ source: 'eBay HTML scrape', count: valid.length, avg: avg.toFixed(2), min, max }];
  } catch { return []; }
}

async function scrapeLamley(query) {
  try {
    const url = `https://lamleygroup.com/?s=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await r.text();
    const articles = [];
    const re = /<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gs;
    let m;
    while ((m = re.exec(html)) !== null && articles.length < 3) {
      articles.push({ url: m[1], title: m[2].trim() });
    }
    return articles;
  } catch { return []; }
}

async function scrapeMattelPage(query) {
  try {
    const searchUrl = `https://creations.mattel.com/search?q=${encodeURIComponent(query)}&type=product`;
    const r = await fetch(searchUrl, { headers: { 'User-Agent': UA } });
    const html = await r.text();
    const products = [];
    const re = /"url":"(\/products\/[^"]+)","title":"([^"]+)","price":(\d+)/g;
    let m;
    while ((m = re.exec(html)) !== null && products.length < 3) {
      products.push({ url: `https://creations.mattel.com${m[1]}`, title: m[2], price: (parseInt(m[3]) / 100).toFixed(2) });
    }
    return products;
  } catch { return []; }
}

async function scrapeIgKeyword(query, handles) {
  handles = handles || ['hotwheelscollectors', 'monsterhigh', 'hotwheels'];
  const results = [];
  for (const handle of handles) {
    try {
      const data = await scrapeIgProfile(handle, 20);
      const kw = query.toLowerCase();
      const relevant = data.posts.filter(p => kw.split(' ').some(w => p.caption.toLowerCase().includes(w)));
      if (relevant.length) results.push({ handle, posts: relevant.slice(0, 3) });
    } catch {}
  }
  return results;
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

function formatWriteup(query, data) {
  const { orangeTrack, reddit, ebay, lamley, mattel, ig, fb } = data;
  const lines = [];

  lines.push(`# 🔍 Research: ${query}`);
  lines.push(`Generated: ${new Date().toISOString()}\n`);

  // Mattel Creations product
  if (mattel?.length) {
    lines.push('## 📦 Mattel Creations');
    mattel.forEach(p => lines.push(`- **${p.title}** — $${p.price}\n  ${p.url}`));
    lines.push('');
  }

  // OrangeTrack release info
  if (orangeTrack?.length) {
    lines.push('## 📅 OrangeTrackDiecast');
    orangeTrack.forEach(s => lines.push(`- ${s}`));
    lines.push('');
  }

  // eBay comps
  if (ebay?.length) {
    lines.push('## 💰 eBay Sold Comps');
    ebay.forEach(e => {
      if (e.source) lines.push(`- ${e.count} sold listings | Avg $${e.avg} | Range $${e.min}–$${e.max}`);
      else lines.push(`- **${e.title}** — $${e.price} (${e.date?.slice(0,10)})`);
    });
    lines.push('');
  }

  // Reddit sentiment
  if (reddit?.length) {
    lines.push('## 💬 Reddit Sentiment');
    reddit.slice(0, 5).forEach(p => lines.push(`- [r/${p.sub}] **${p.title}** (${p.score} pts)\n  ${p.url}`));
    lines.push('');
  }

  // LamleyGroup
  if (lamley?.length) {
    lines.push('## 📰 LamleyGroup');
    lamley.forEach(a => lines.push(`- [${a.title}](${a.url})`));
    lines.push('');
  }

  // Instagram
  if (ig?.length) {
    lines.push('## 📸 Instagram');
    ig.forEach(({ handle, posts }) => {
      lines.push(`**@${handle}**`);
      posts.forEach(p => lines.push(`- ${p.timestamp?.slice(0,10)} | ${p.likes} likes\n  ${p.caption.slice(0,150)}\n  ${p.url}`));
    });
    lines.push('');
  }

  // Facebook
  if (fb && Object.keys(fb).length) {
    lines.push('## 👥 Facebook Groups');
    for (const [group, posts] of Object.entries(fb)) {
      if (!posts?.length) continue;
      lines.push(`**${group}**`);
      posts.slice(0,3).forEach(p => lines.push(`- ${p.slice(0,200)}`));
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('## 📋 Writeup Template');
  lines.push('> Fill in after reviewing data above\n');
  lines.push('```');
  lines.push(`💰 Cost: $`);
  lines.push(`💰 Resale: $`);
  lines.push(`Max Per Order: `);
  lines.push(`Bulk Buy Estimate: `);
  lines.push(`Flip (<1 month): $`);
  lines.push(`Invest (>1 Year): $`);
  lines.push(`Accounts Required: `);
  lines.push(`Caveats: `);
  lines.push('```');

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function research(query, opts = {}) {
  const {
    useIg = true,
    useFb = false, // FB is slow — opt-in
    fbGroups = null,
    igHandles = null,
  } = opts;

  console.log(`[Fiddler] Researching: "${query}"`);
  console.log('[Fiddler] Fetching: OrangeTrack, Reddit, eBay, LamleyGroup, Mattel...');

  const [orangeTrack, reddit, ebay, lamley, mattel] = await Promise.all([
    scrapeOrangeTrack(query),
    scrapeReddit(query),
    scrapeEbay(query),
    scrapeLamley(query),
    scrapeMattelPage(query),
  ]);

  let ig = [];
  if (useIg) {
    console.log('[Fiddler] Fetching Instagram...');
    ig = await scrapeIgKeyword(query, igHandles);
  }

  let fb = {};
  if (useFb) {
    console.log('[Fiddler] Fetching Facebook groups...');
    fb = await searchAllGroups(query, fbGroups);
  }

  return formatWriteup(query, { orangeTrack, reddit, ebay, lamley, mattel, ig, fb });
}

// CLI
if (process.argv[2]) {
  const query = process.argv.slice(2).join(' ');
  const useFb = process.argv.includes('--fb');
  const writeup = await research(query, { useIg: true, useFb });
  console.log('\n' + writeup);
}
