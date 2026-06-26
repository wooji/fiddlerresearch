#!/usr/bin/env node
// Round 3: find correct URLs + StockX batch MSRP for all products
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { chromium } from 'playwright';

function loadProxies() {
  return [
    ...readFileSync('ISP.txt','utf8').split('\n'),
    ...readFileSync('heroresi.txt','utf8').split('\n'),
  ].filter(l=>l.trim()).map(p=>{
    const [host,port,user,pass]=p.trim().split(':');
    return {url:`http://${user}:${pass}@${host}:${port}`,host,port,user,pass};
  });
}

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const proxies=loadProxies();
let pi=20;

function curlProxy(url, proxy, timeout=20) {
  try {
    const cmd=`curl -s -x "${proxy.url}" -A "${UA}" -H "Accept: text/html,*/*;q=0.9" -H "Accept-Language: en-US,en;q=0.9" -L --max-time ${timeout} --connect-timeout 8 --compressed "${url}"`;
    return execSync(cmd,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:(timeout+5)*1000})||'';
  } catch { return ''; }
}

function extractPrices(html) {
  const re=/\$[\d,]+\.\d{2}/g; const prices=[]; let m;
  while((m=re.exec(html))!==null) prices.push(m[0]);
  return [...new Set(prices)];
}

async function playwrightFetch(url, proxyIdx, waitSel=null, wait=4000) {
  const proxy=proxies[proxyIdx%proxies.length];
  const browser=await chromium.launch({
    proxy:{server:`http://${proxy.host}:${proxy.port}`,username:proxy.user,password:proxy.pass},
    headless:true,
  });
  try {
    const ctx=await browser.newContext({userAgent:UA});
    const page=await ctx.newPage();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    if(waitSel){try{await page.waitForSelector(waitSel,{timeout:8000});}catch{}}
    await page.waitForTimeout(wait);
    const html=await page.content();
    await browser.close();
    return html;
  } catch(e) { await browser.close(); throw e; }
}

// ===== 1. StockX batch MSRP for all pipeline products =====
console.log('\n[1] StockX batch MSRP lookup...');
const { default: stockx } = await import('./lib/stockx.mjs');

const PRODUCTS = [
  // Pokemon
  {key:'pe-spc', name:'Prismatic Evolutions Super Premium Collection', cat:'pokemon'},
  {key:'pe-etb', name:'Prismatic Evolutions Elite Trainer Box', cat:'pokemon'},
  {key:'ah-bb', name:'Scarlet Violet Prismatic Evolutions booster box', cat:'pokemon'},
  {key:'pb-bb', name:'Surging Sparks booster box pokemon', cat:'pokemon'},
  // MTG
  {key:'stx-cbb', name:'Secrets of Strixhaven Collector Booster Box MTG', cat:'mtg'},
  // Lorcana
  {key:'aotv-bb', name:'Disney Lorcana Attack of the Vine Booster Box', cat:'lorcana'},
  // One Piece
  {key:'op10-bb', name:'One Piece OP-10 Royal Blood Booster Box', cat:'one_piece'},
  {key:'op12-bb', name:'One Piece OP-12 Booster Box', cat:'one_piece'},
  {key:'eb05', name:'One Piece EB-05 Booster Box', cat:'one_piece'},
  // Topps
  {key:'topps-chrome-baseball-2026', name:'2026 Topps Chrome Baseball Hobby Box', cat:'topps'},
  {key:'topps-chrome-nba-2026', name:'2025-26 Topps Chrome Basketball Hobby Box', cat:'topps'},
  {key:'topps-series1-2026', name:'2026 Topps Series 1 Baseball Hobby Box', cat:'topps'},
];

const stockxResults = {};
for(const prod of PRODUCTS) {
  try {
    const res = await stockx.stockxMarket(prod.name, prod.cat==='topps'?'sports':prod.cat);
    const msrp = res?.msrp ?? res?.productAttributes?.retailPrice ?? null;
    const market = res?.market ?? res?.last ?? null;
    console.log(`  ${prod.key}: MSRP=$${msrp} market=$${market} (StockX)`);
    stockxResults[prod.key] = { msrp, market, via:'stockx' };
  } catch(e) {
    console.log(`  ${prod.key}: ERR ${e.message.slice(0,60)}`);
    stockxResults[prod.key] = { msrp:null, market:null, err: e.message.slice(0,80) };
  }
}

// ===== 2. Probe CoolStuffInc actual URL structure =====
console.log('\n[2] CoolStuffInc URL discovery...');
{
  // Try to hit their homepage and find Pokemon category URL
  const html = await playwrightFetch('https://www.coolstuffinc.com/main_pokemon.php',pi++,'.main-content',3000);
  const links = [...html.matchAll(/href="([^"]*pokemon[^"]*booster[^"]*)"/gi)].map(m=>m[1]).slice(0,10);
  console.log(`  Pokemon booster links: ${links.join('\n    ')}`);
  // Try search
  const searchHtml = await playwrightFetch('https://www.coolstuffinc.com/main_search.php?q=booster+box&catid=44',pi++,'.main-content',4000);
  const prices=extractPrices(searchHtml);
  const items=searchHtml.match(/class="[^"]*price[^"]*"[^>]*>\s*\$[\d.]+/g)?.slice(0,10)||[];
  console.log(`  Search prices: ${prices.slice(0,10).join(', ')}`);
  console.log(`  Items with prices: ${items.length}`);
  // Try their category ID for Pokemon
  const pokeHtml=await playwrightFetch('https://www.coolstuffinc.com/main_search.php?q=pokemon+booster+box',pi++,'.main-content',5000);
  const pokeP=extractPrices(pokeHtml);
  console.log(`  Pokemon search prices: ${pokeP.slice(0,10).join(', ')}`);
  // Extract product names + prices
  const prodRe=/<div[^>]*class="[^"]*product[^"]*"[^>]*>[\s\S]{0,500}?<\/div>/gi;
  let pm; const prods=[];
  while((pm=prodRe.exec(pokeHtml))!==null) {
    const price=pm[0].match(/\$[\d.]+/)?.[0];
    const name=pm[0].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,80);
    if(price) prods.push(`${price} — ${name}`);
  }
  console.log(`  Products: ${prods.slice(0,10).join('\n    ')}`);
}

// ===== 3. TrollAndToad Shopify correct URL =====
console.log('\n[3] TrollAndToad Shopify URL discovery...');
{
  const html=await playwrightFetch('https://www.trollandtoad.com/pokemon-tcg/',pi++,'[class*="product"]',4000);
  const prices=extractPrices(html);
  const links=[...html.matchAll(/href="(\/pokemon-tcg\/[^"]+)"/gi)].map(m=>m[1]).filter(u=>/sealed|booster|box/i.test(u)).slice(0,10);
  console.log(`  Pokemon sealed links: ${links.join('\n    ')}`);
  console.log(`  Prices: ${prices.slice(0,10).join(', ')}`);

  // Try the Shopify collection URL
  const collHtml=await playwrightFetch('https://www.trollandtoad.com/collections/pokemon-booster-boxes',pi++,'[class*="price"]',4000);
  const collPrices=extractPrices(collHtml);
  const hasProducts=/\$[\d]+\.\d{2}/.test(collHtml)&&/booster|pokemon/i.test(collHtml);
  console.log(`  Shopify collection: ${hasProducts?'✅':'❌'} prices=${collPrices.slice(0,8).join(', ')} (${collHtml.length}b)`);

  // Try MTG
  const mtgHtml=await playwrightFetch('https://www.trollandtoad.com/collections/magic-the-gathering-booster-boxes',pi++,'[class*="price"]',4000);
  const mtgPrices=extractPrices(mtgHtml);
  console.log(`  MTG Shopify: prices=${mtgPrices.slice(0,8).join(', ')} (${mtgHtml.length}b)`);
}

// ===== 4. CardKingdom Playwright =====
console.log('\n[4] CardKingdom via Playwright...');
{
  const html=await playwrightFetch('https://www.cardkingdom.com/catalog/magic_sealed_product/list?filter[search]=collector+booster+box',pi++,'[class*="productItem"]',5000);
  const prices=extractPrices(html);
  const names=[...html.matchAll(/class="[^"]*productName[^"]*"[^>]*>([\s\S]{0,100}?)<\/[a-z]+>/gi)].map(m=>m[1].replace(/<[^>]+>/g,'').trim()).slice(0,10);
  console.log(`  CardKingdom: prices=${prices.slice(0,10).join(', ')} (${html.length}b)`);
  console.log(`  Names: ${names.join(' | ')}`);
}

// ===== 5. ICv2 find actual product-news URLs with MSRP =====
console.log('\n[5] ICv2 article search for MSRP data...');
{
  const searchHtml=curlProxy('https://icv2.com/articles/search?searchterm=pokemon+booster+box+MSRP',proxies[pi++%proxies.length],15);
  // find article links
  const artLinks=[...searchHtml.matchAll(/href="(\/articles\/news\/view\/\d+\/[^"]+)"/gi)].map(m=>`https://icv2.com${m[1]}`).slice(0,5);
  console.log(`  Article links: ${artLinks.join('\n    ')}`);

  // Try a known article format
  const artHtml=curlProxy('https://icv2.com/articles/news/view/60000',proxies[pi++%proxies.length],15);
  const artPrices=extractPrices(artHtml);
  const hasMsrp=/MSRP/i.test(artHtml);
  console.log(`  Sample article prices: ${artPrices.join(', ')||'none'} MSRP_text=${hasMsrp}`);
  console.log(`  Snippet: ${artHtml.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,400)}`);
}

// ===== 6. MTGGoldfish correct URL =====
console.log('\n[6] MTGGoldfish via Playwright...');
{
  const html=await playwrightFetch('https://www.mtggoldfish.com/sets',pi++,'table',4000);
  const prices=extractPrices(html);
  const rows=[...html.matchAll(/collector|draft|set booster/gi)].length;
  console.log(`  MTGGoldfish: prices=${prices.slice(0,8).join(', ')} collector_mentions=${rows} (${html.length}b)`);
  console.log(`  snippet: ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,300)}`);
}

console.log('\n\n=== ROUND 3 SUMMARY ===');
console.log('StockX MSRP results:');
Object.entries(stockxResults).forEach(([k,v])=>console.log(`  ${k}: MSRP=${v.msrp??'null'} market=${v.market??'null'}`));

writeFileSync('msrp-probe-round3.json',JSON.stringify({stockxResults},null,2));
console.log('\nResults → msrp-probe-round3.json');
