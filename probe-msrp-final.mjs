#!/usr/bin/env node
// Final MSRP probe: StockX with delays + WotC + ICv2 articles + CoolStuffInc Playwright
import { stockxMarket } from './lib/stockx.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { chromium } from 'playwright';

function loadProxies() {
  return [...readFileSync('ISP.txt','utf8').split('\n'),...readFileSync('heroresi.txt','utf8').split('\n')]
    .filter(l=>l.trim()).map(p=>{const [h,po,u,pa]=p.trim().split(':');return{url:`http://${u}:${pa}@${h}:${po}`,host:h,port:po,user:u,pass:pa};});
}
const proxies=loadProxies();
let pi=40;
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function curlProxy(url,proxy,timeout=20) {
  try {
    return execSync(`curl -s -x "${proxy.url}" -A "${UA}" -H "Accept: text/html,*/*" -L --max-time ${timeout} --connect-timeout 8 --compressed "${url}"`,
      {encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:(timeout+5)*1000})||'';
  } catch { return ''; }
}

async function playwrightFetch(url, proxyObj, wait=4000, sel=null) {
  const browser=await chromium.launch({proxy:{server:`http://${proxyObj.host}:${proxyObj.port}`,username:proxyObj.user,password:proxyObj.pass},headless:true});
  try {
    const ctx=await browser.newContext({userAgent:UA});
    const page=await ctx.newPage();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    if(sel){try{await page.waitForSelector(sel,{timeout:8000});}catch{}}
    await page.waitForTimeout(wait);
    const html=await page.content();
    await browser.close();
    return html;
  } catch(e){await browser.close();throw e;}
}

const msrpResults={};

// ===== StockX with delays (remaining products) =====
console.log('\n[STOCKX] Querying with 3s delay...');
const REMAINING=[
  {key:'me05-etb',  q:'Mega Charizard X ex Ultra Premium Collection Pokemon', cat:'pokemon'},
  {key:'aotv-bb',   q:'Disney Lorcana Attack of the Vine Booster Box',        cat:'lorcana'},
  {key:'itr-bb',    q:"Disney Lorcana Illumineer's Trove Booster Box",         cat:'lorcana'},
  {key:'op10-bb',   q:'One Piece Card Game OP-10 Royal Blood Booster Box',    cat:'one_piece'},
  {key:'op12-bb',   q:'One Piece Card Game OP-12 Booster Box',                cat:'one_piece'},
  {key:'eb05',      q:'One Piece Card Game EB-05 Booster Box',                cat:'one_piece'},
  {key:'op13-bb',   q:'One Piece Card Game OP-13 Booster Box',                cat:'one_piece'},
  {key:'topps-chrome-26', q:'2026 Topps Chrome Baseball Hobby Box',          cat:'topps'},
  {key:'topps-tier1-26',  q:'2026 Topps Tier One Baseball Hobby Box',        cat:'topps'},
  {key:'topps-nba-26',    q:'2025-26 Topps Chrome Basketball Hobby Box',     cat:'topps'},
];

const KNOWN={
  'pe-spc': 79.99, 'pe-etb': 49.99, 'pb-bb': null, // StockX $161 unreliable, need verify
  'sv9-etb': 49.99, 'sv9-bb': null, // StockX $250 for enhanced box - check
  'me04-etb': 59.99, 'fin-cbb': 229.99, // fin-cbb $60 from StockX is wrong (per pack price?), MTG CBB = ~$229
};

for(const prod of REMAINING) {
  await sleep(3500);
  try {
    const res=await stockxMarket(prod.q, prod.cat==='topps'?'sports':prod.cat);
    const msrp=res?.msrp??res?.productAttributes?.retailPrice??null;
    const market=res?.lastSale??res?.lowestAsk??res?.price??null;
    const urlKey=res?.urlKey??null;
    console.log(`  ${prod.key}: MSRP=$${msrp??'null'} ask=$${market??'null'} slug=${urlKey??'—'}`);
    msrpResults[prod.key]={msrp,market,urlKey,via:'stockx'};
  } catch(e) {
    console.log(`  ${prod.key}: ERR ${e.message.slice(0,80)}`);
    msrpResults[prod.key]={err:e.message.slice(0,60)};
  }
}

// ===== WotC/magic.wizards.com for stx-cbb =====
console.log('\n[WotC] Secrets of Strixhaven product page via Playwright...');
try {
  const proxy=proxies[pi++%proxies.length];
  const html=await playwrightFetch('https://magic.wizards.com/en/products/secrets-of-strixhaven',proxy,5000,'[class*="price"],[class*="Price"],h2,h3');
  const priceRe=/\$[\d,]+\.\d{2}/g; const prices=[]; let m;
  while((m=priceRe.exec(html))!==null) prices.push(m[0]);
  const msrpRe=/MSRP[:\s]+\$?([\d.]+)/gi; let msrpMatch; const msrps=[];
  while((msrpMatch=msrpRe.exec(html))!==null) msrps.push(msrpMatch[1]);
  console.log(`  WotC prices: ${prices.join(', ')||'none'}`);
  console.log(`  WotC MSRP text: ${msrps.join(', ')||'none'}`);
  console.log(`  snippet: ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,400)}`);
  msrpResults['stx-cbb-wotc']={prices,msrps};
} catch(e) { console.log(`  WotC: ${e.message.slice(0,80)}`); }

// ===== ICv2 product-news articles with MSRP =====
console.log('\n[ICv2] Searching articles for product MSRP...');
const icv2Queries=[
  'https://icv2.com/articles/news/view/60000/secrets-strixhaven',
  'https://icv2.com/articles/search/index?searchterm=secrets+strixhaven',
  'https://icv2.com/articles/search/index?searchterm=attack+of+the+vine+lorcana',
  'https://icv2.com/articles/search/index?searchterm=one+piece+tcg+2026',
];
for(const url of icv2Queries) {
  const html=curlProxy(url,proxies[pi++%proxies.length],15);
  const prices=html.match(/\$[\d,]+\.\d{2}/g)||[];
  const msrps=html.match(/MSRP[:\s]+\$?([\d.]+)/gi)||[];
  const artLinks=html.match(/href="(\/articles\/news\/view\/\d+\/[^"]+)"/g)?.slice(0,5)||[];
  if(html.length>2000&&(prices.length>0||artLinks.length>0)) {
    console.log(`  ${url.slice(-40)}: prices=${prices.join(', ')||'none'} links=${artLinks.length}`);
    if(artLinks.length>0) console.log(`    links: ${artLinks.slice(0,3).join('\n      ')}`);
  } else {
    console.log(`  ${url.slice(-40)}: no content (${html.length}b)`);
  }
}

// Probe specific ICv2 article format to find MSRP content
const sampleArticles=[
  'https://icv2.com/articles/news/view/56891/secrets-of-strixhaven',
  'https://icv2.com/articles/news/view/56100/lorcana-attack-vine',
  'https://icv2.com/articles/news/view/55800/one-piece-tcg-2026',
];
console.log('\n  Probing sample ICv2 article URLs...');
for(const url of sampleArticles) {
  const html=curlProxy(url,proxies[pi++%proxies.length],12);
  const prices=html.match(/\$[\d,]+\.?\d*/g)||[];
  const hasContent=html.length>5000;
  console.log(`  ${url.split('/').pop()}: ${hasContent?prices.slice(0,5).join(', ')||'loaded-no-price':'(not found)'}  (${html.length}b)`);
  if(hasContent) console.log(`    ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,200)}`);
}

// ===== CoolStuffInc via Playwright - find correct URL =====
console.log('\n[CoolStuffInc] Playwright search for sealed boxes...');
try {
  const proxy=proxies[pi++%proxies.length];
  const browser=await chromium.launch({proxy:{server:`http://${proxy.host}:${proxy.port}`,username:proxy.user,password:proxy.pass},headless:true});
  const ctx=await browser.newContext({userAgent:UA});
  const page=await ctx.newPage();
  await page.goto('https://www.coolstuffinc.com',{waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForTimeout(2000);

  // Get nav links to find correct Pokemon/MTG sealed category
  const navLinks=await page.$$eval('a[href*="pokemon"],a[href*="magic"],a[href*="booster"]',els=>els.map(e=>({text:e.textContent.trim().slice(0,40),href:e.href})).slice(0,20));
  console.log(`  Nav links: ${navLinks.map(l=>`${l.text} => ${l.href}`).join('\n    ')}`);

  // Try search
  await page.goto('https://www.coolstuffinc.com/main_search.php?q=pokemon+booster+box',{waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForTimeout(3000);
  const searchHtml=await page.content();
  const prices=searchHtml.match(/\$[\d,]+\.\d{2}/g)||[];
  const items=await page.$$eval('[class*="product"],[class*="item"]',els=>els.slice(0,10).map(e=>e.textContent.replace(/\s+/g,' ').trim().slice(0,80)));
  console.log(`  Search prices: ${prices.slice(0,10).join(', ')||'none'}`);
  console.log(`  Items: ${items.slice(0,5).join(' | ')}`);
  console.log(`  URL: ${page.url()}`);

  await browser.close();
} catch(e){ console.log(`  CoolStuffInc: ${e.message.slice(0,80)}`); }

// ===== Topps via Playwright with stealth =====
console.log('\n[Topps] Playwright stealth approach...');
try {
  const proxy=proxies[pi++%proxies.length];
  const browser=await chromium.launch({
    proxy:{server:`http://${proxy.host}:${proxy.port}`,username:proxy.user,password:proxy.pass},
    headless:true,
    args:['--disable-blink-features=AutomationControlled'],
  });
  const ctx=await browser.newContext({
    userAgent:UA,
    viewport:{width:1366,height:768},
    extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9'},
  });
  await ctx.addInitScript(()=>{ Object.defineProperty(navigator,'webdriver',{get:()=>undefined}); });
  const page=await ctx.newPage();
  await page.goto('https://www.topps.com/collections/baseball',{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForTimeout(5000);
  const title=await page.title();
  const html=await page.content();
  const prices=html.match(/\$[\d,]+\.\d{2}/g)||[];
  const blocked=/<title>.*?cloudflare|you have been blocked|access denied/i.test(html);
  console.log(`  Topps: title="${title}" blocked=${blocked} prices=${prices.slice(0,8).join(', ')||'none'} (${html.length}b)`);
  if(!blocked&&prices.length>0) {
    const prods=html.match(/<[^>]*data-product[^>]*>[\s\S]{0,200}?<\/[a-z]+>/gi)?.slice(0,5)||[];
    console.log(`  Products: ${prods.map(p=>p.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,80)).join('\n    ')}`);
  }
  await browser.close();
} catch(e){ console.log(`  Topps: ${e.message.slice(0,80)}`); }

// ===== en.onepiece-cardgame.com — find booster box price =====
console.log('\n[OnePiece] Probe booster box page...');
try {
  const proxy=proxies[pi++%proxies.length];
  const browser=await chromium.launch({proxy:{server:`http://${proxy.host}:${proxy.port}`,username:proxy.user,password:proxy.pass},headless:true});
  const ctx=await browser.newContext({userAgent:UA});
  const page=await ctx.newPage();
  await page.goto('https://en.onepiece-cardgame.com/products/?subcategory=boosters',{waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForTimeout(4000);
  const html=await page.content();
  // Extract product name + price pairs
  const items=await page.$$eval('[class*="item"],[class*="product"],[class*="card"]',els=>els.slice(0,30).map(e=>{
    const text=e.textContent.replace(/\s+/g,' ').trim();
    const price=text.match(/\$[\d.]+/)?.[0];
    const name=text.slice(0,80);
    return price?`${price} — ${name}`:null;
  }).filter(Boolean));
  console.log(`  OP items: ${items.slice(0,15).join('\n    ')}`);
  const allPrices=html.match(/\$[\d,]+\.?\d*/g)||[];
  console.log(`  All prices in page: ${[...new Set(allPrices)].join(', ')}`);
  await browser.close();
} catch(e){ console.log(`  OnePiece: ${e.message.slice(0,80)}`); }

// ===== FINAL SUMMARY =====
console.log('\n\n=== FINAL MSRP SOURCE RANKING ===');
console.log(`
#1 — StockX (stockx.mjs): returns msrp field for most Pokemon + some MTG/sports
   Coverage: ~60% of products. Add 3s delay between calls.
   Verified reliable: pe-spc=$79.99, pe-etb=$49.99, me04=$59.99

#2 — en.onepiece-cardgame.com (direct curl): pack prices present, booster box = 24×pack price
   Coverage: One Piece only. $4.99 pack × 24 = $119.76 ≈ $120 MSRP.

#3 — TrollAndToad Shopify JSON (/collections/{slug}/products.json): sells near MSRP for new products
   Coverage: Pokemon + MTG. Not MSRP but within 5-10% for new releases.

#4 — Target Playwright (playwright proxy): actual retail prices for in-stock Pokemon
   Coverage: Pokemon products at Target retail.

#5 — ICv2.com: trade articles contain MSRP text — requires finding correct article URL per product.
`);

console.log('\nStockX remaining results:');
Object.entries(msrpResults).forEach(([k,v])=>{
  if(v.msrp) console.log(`  ✅ ${k}: $${v.msrp} (${v.via})`);
  else if(v.market) console.log(`  ⚠️  ${k}: no MSRP, market=$${v.market}`);
  else console.log(`  ❌ ${k}: ${v.err||'no data'}`);
});

writeFileSync('msrp-final-results.json',JSON.stringify(msrpResults,null,2));
