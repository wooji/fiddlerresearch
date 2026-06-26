#!/usr/bin/env node
// MSRP source probe — tests all TCG/Topps price sources via proxy rotation
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { chromium } from 'playwright';

function loadProxies() {
  const lines = [
    ...readFileSync('ISP.txt','utf8').split('\n'),
    ...readFileSync('heroresi.txt','utf8').split('\n'),
  ].filter(l => l.trim());
  return lines.map(p => {
    const [host,port,user,pass] = p.trim().split(':');
    return { url: `http://${user}:${pass}@${host}:${port}`, host, port, user, pass };
  });
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HDRS = `-H "User-Agent: ${UA}" -H "Accept: text/html,application/xhtml+xml,*/*;q=0.9" -H "Accept-Language: en-US,en;q=0.9" -H "Accept-Encoding: gzip, deflate, br" -H "Cache-Control: no-cache"`;

async function curlProxy(url, proxy, timeout=20) {
  try {
    const cmd = `curl -s -x "${proxy.url}" ${HDRS} -L --max-time ${timeout} --connect-timeout 8 --compressed "${url}"`;
    const out = execSync(cmd, { encoding:'utf8', stdio:['pipe','pipe','pipe'], timeout: (timeout+5)*1000 });
    return out || '';
  } catch { return ''; }
}

async function curlDirect(url, timeout=20) {
  try {
    const cmd = `curl -s ${HDRS} -L --max-time ${timeout} --connect-timeout 8 --compressed "${url}"`;
    const out = execSync(cmd, { encoding:'utf8', stdio:['pipe','pipe','pipe'], timeout: (timeout+5)*1000 });
    return out || '';
  } catch { return ''; }
}

function extractPrices(html) {
  const prices = [];
  const re = /\$[\d,]+\.\d{2}/g;
  let m; while ((m = re.exec(html)) !== null) prices.push(m[0]);
  return [...new Set(prices)].slice(0, 10);
}

function hasUsablePrices(html, minCount=2) {
  return extractPrices(html).length >= minCount;
}

const TARGETS = [
  {
    name: 'Topps.com — baseball boxes',
    url: 'https://www.topps.com/products/cards/baseball',
    check: h => /\$[\d]+\.\d{2}/.test(h) && /box|pack|hobby/i.test(h),
    category: 'topps',
  },
  {
    name: 'Topps.com — product list',
    url: 'https://www.topps.com/collections/trading-cards',
    check: h => /\$[\d]+\.\d{2}/.test(h),
    category: 'topps',
  },
  {
    name: 'Bulbapedia — ETB prices',
    url: 'https://bulbapedia.bulbagarden.net/wiki/Prismatic_Evolutions_(TCG)',
    check: h => /\$[\d]+\.\d{2}/.test(h) || /MSRP|retail/i.test(h),
    category: 'pokemon',
  },
  {
    name: 'ICv2.com — TCG news',
    url: 'https://icv2.com/articles/tags/id/7/collectible-card-games',
    check: h => /MSRP|\$[\d]+|retail price/i.test(h),
    category: 'all',
  },
  {
    name: 'ICv2.com — Pokemon',
    url: 'https://icv2.com/articles/tags/id/38/pokemon',
    check: h => /MSRP|\$[\d]+|retail/i.test(h),
    category: 'pokemon',
  },
  {
    name: 'Coolstuffinc — Pokemon sealed',
    url: 'https://www.coolstuffinc.com/sc/Pokemon-TCG?subcategory=Booster+Boxes&instock=1',
    check: h => /\$[\d]+\.\d{2}/.test(h) && /booster|sealed/i.test(h),
    category: 'pokemon',
  },
  {
    name: 'Coolstuffinc — MTG sealed',
    url: 'https://www.coolstuffinc.com/sc/Magic-the-Gathering?subcategory=Booster+Boxes&instock=1',
    check: h => /\$[\d]+\.\d{2}/.test(h) && /collector|booster/i.test(h),
    category: 'mtg',
  },
  {
    name: 'TrollAndToad — Pokemon booster boxes',
    url: 'https://www.trollandtoad.com/pokemon/pokemon-booster-boxes/1?sort-by=name&sort-order=asc&min-price=50&max-price=300',
    check: h => /\$[\d]+\.\d{2}/.test(h),
    category: 'pokemon',
  },
  {
    name: 'TrollAndToad — MTG booster boxes',
    url: 'https://www.trollandtoad.com/magic-the-gathering/booster-boxes/1?sort-by=name&sort-order=asc',
    check: h => /\$[\d]+\.\d{2}/.test(h),
    category: 'mtg',
  },
  {
    name: 'TCGPlayer — One Piece booster boxes',
    url: 'https://www.tcgplayer.com/search/disney-lorcana/product?productLineName=disney-lorcana&view=grid&productTypeName=Booster+Box',
    check: h => /\$[\d]+\.\d{2}/.test(h),
    category: 'lorcana',
  },
  {
    name: 'ACD Distribution — sealed games',
    url: 'https://www.acddistribution.com/index.php?pg=search&t=Pokemon&c=CCG+Sealed+Product&s=Price',
    check: h => /\$[\d]+|\d+\.\d{2}/.test(h),
    category: 'pokemon',
  },
  {
    name: 'Southern Hobby — Pokemon',
    url: 'https://www.southernhobby.com/search?q=pokemon+booster+box&type=product',
    check: h => /\$[\d]+\.\d{2}/.test(h) && /booster/i.test(h),
    category: 'pokemon',
  },
  {
    name: 'MTGGoldfish — sets prices',
    url: 'https://www.mtggoldfish.com/sets/sealed#online',
    check: h => /\$[\d]+/.test(h) && /collector|booster/i.test(h),
    category: 'mtg',
  },
  {
    name: 'CardKingdom — MTG sealed',
    url: 'https://www.cardkingdom.com/catalog/magic_sealed_product/by/alpha_desc',
    check: h => /\$[\d]+\.\d{2}/.test(h) && /collector|booster|box/i.test(h),
    category: 'mtg',
  },
  {
    name: 'Rosewater/WotC — product page',
    url: 'https://magic.wizards.com/en/products/secrets-of-strixhaven',
    check: h => /\$[\d]+|\d+\.\d{2}|MSRP|retail/i.test(h),
    category: 'mtg',
  },
  {
    name: 'Pokemon Center — booster box',
    url: 'https://www.pokemoncenter.com/en-us/category/elite-trainer-boxes',
    check: h => /\$[\d]+\.\d{2}/.test(h),
    category: 'pokemon',
  },
  {
    name: 'Ravensburger US — Lorcana',
    url: 'https://www.ravensburger.us/en-US/search?search=lorcana+booster+box',
    check: h => /\$[\d]+\.\d{2}/.test(h) && /booster|lorcana/i.test(h),
    category: 'lorcana',
  },
  {
    name: 'One Piece — official products page',
    url: 'https://en.onepiece-cardgame.com/products/?subcategory=boosters',
    check: h => /\$[\d]+|\d+\.\d{2}/.test(h),
    category: 'one_piece',
  },
  {
    name: 'Target — Pokemon sealed',
    url: 'https://www.target.com/s?searchTerm=pokemon+booster+box&category=0%7CAll%7Cmatchallpartial%7Call+categories',
    check: h => /\$[\d]+\.\d{2}/.test(h) && /booster|pokemon/i.test(h),
    category: 'pokemon',
  },
  {
    name: 'Amazon — MTG Secrets of Strixhaven MSRP',
    url: 'https://www.amazon.com/dp/B0GFDD1RLS',
    check: h => /\$[\d]+\.\d{2}/.test(h) && /strixhaven|collector/i.test(h),
    category: 'mtg',
  },
];

const results = [];
const proxies = loadProxies();
let pi = 0;

console.log(`[probe] ${proxies.length} proxies loaded, ${TARGETS.length} targets`);

for (const target of TARGETS) {
  console.log(`\n[probe] Testing: ${target.name}`);
  let html = '';
  let method = '';

  // Try direct first (fast check)
  html = await curlDirect(target.url, 12);
  if (html.length > 500 && !/<title>.*?cloudflare|just a moment|access denied|403/i.test(html)) {
    method = 'direct-curl';
  } else {
    // Try 3 proxies
    for (let attempt = 0; attempt < 3; attempt++) {
      const proxy = proxies[pi % proxies.length]; pi++;
      html = await curlProxy(target.url, proxy, 18);
      if (html.length > 500 && !/<title>.*?cloudflare|just a moment|access denied/i.test(html.slice(0,2000))) {
        method = `proxy-curl(${proxy.host})`;
        break;
      }
      html = '';
    }
  }

  const works = html.length > 500 && target.check(html);
  const prices = extractPrices(html);
  const snippet = html.length > 200 ? html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,300) : '(no content)';

  console.log(`  Status: ${works ? '✅ WORKS' : html.length > 200 ? '⚠️  LOADS (no prices)' : '❌ BLOCKED'} via ${method || 'failed'}`);
  if (prices.length) console.log(`  Prices found: ${prices.join(', ')}`);
  console.log(`  Snippet: ${snippet.slice(0,200)}`);

  results.push({
    name: target.name,
    url: target.url,
    category: target.category,
    works,
    method,
    hasContent: html.length > 500,
    prices,
    snippet: snippet.slice(0,300),
  });
}

// Playwright pass for JS-heavy targets that loaded but no prices
const jsTargets = results.filter(r => r.hasContent && !r.works && ['pokemon.com','pokemoncenter','ravensburger','target.com'].some(d => r.url.includes(d)));

if (jsTargets.length > 0) {
  console.log(`\n[probe] Playwright pass for ${jsTargets.length} JS-heavy targets...`);
  const proxy = proxies[pi % proxies.length]; pi++;
  const browser = await chromium.launch({
    proxy: { server: `http://${proxy.host}:${proxy.port}`, username: proxy.user, password: proxy.pass },
    headless: true,
  });

  for (const target of jsTargets) {
    try {
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ 'User-Agent': UA });
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);
      const html = await page.content();
      const prices = extractPrices(html);
      const works = prices.length > 0 && target.check ? target.check(html) : prices.length > 0;
      const idx = results.findIndex(r => r.url === target.url);
      results[idx] = { ...results[idx], works, method: `playwright-proxy(${proxy.host})`, prices };
      console.log(`  ${target.name}: ${works ? '✅' : '⚠️'} prices=${prices.join(',')||'none'}`);
      await page.close();
    } catch(e) {
      console.log(`  ${target.name}: ❌ ${e.message.slice(0,80)}`);
    }
  }
  await browser.close();
}

// Summary
console.log('\n\n=== MSRP SOURCE RANKING ===');
const working = results.filter(r => r.works).sort((a,b) => b.prices.length - a.prices.length);
const partial = results.filter(r => !r.works && r.hasContent);
const blocked = results.filter(r => !r.hasContent);

console.log(`\n✅ WORKING (${working.length}):`);
working.forEach((r,i) => console.log(`  ${i+1}. ${r.name} [${r.category}] — ${r.prices.length} prices via ${r.method}\n     ${r.url}`));

console.log(`\n⚠️  LOADS/NO PRICES (${partial.length}):`);
partial.forEach(r => console.log(`  - ${r.name} [${r.category}]`));

console.log(`\n❌ BLOCKED (${blocked.length}):`);
blocked.forEach(r => console.log(`  - ${r.name}`));

writeFileSync('msrp-probe-results.json', JSON.stringify({ working, partial, blocked, all: results }, null, 2));
console.log('\nResults → msrp-probe-results.json');
