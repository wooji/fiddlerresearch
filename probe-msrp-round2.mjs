#!/usr/bin/env node
// Round 2: fix URLs + Playwright for Topps/Amazon/CoolStuffInc/CardKingdom
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

function curlProxy(url, proxy, timeout=20) {
  try {
    const cmd=`curl -s -x "${proxy.url}" -A "${UA}" -H "Accept: text/html,*/*;q=0.9" -H "Accept-Language: en-US,en;q=0.9" -L --max-time ${timeout} --connect-timeout 8 --compressed "${url}"`;
    return execSync(cmd,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:(timeout+5)*1000})||'';
  } catch { return ''; }
}

function extractPrices(html) {
  const prices=[];
  const re=/\$[\d,]+\.\d{2}/g; let m;
  while((m=re.exec(html))!==null) prices.push(m[0]);
  return [...new Set(prices)].slice(0,15);
}

const proxies=loadProxies();
let pi=5; // skip first few used in round 1

async function playwrightFetch(url, proxyIdx, waitFor=null, extraWait=3000) {
  const proxy=proxies[proxyIdx%proxies.length];
  const browser=await chromium.launch({
    proxy:{server:`http://${proxy.host}:${proxy.port}`,username:proxy.user,password:proxy.pass},
    headless:true,
  });
  try {
    const ctx=await browser.newContext({userAgent:UA});
    const page=await ctx.newPage();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    if(waitFor) {
      try { await page.waitForSelector(waitFor,{timeout:8000}); } catch {}
    }
    await page.waitForTimeout(extraWait);
    const html=await page.content();
    await browser.close();
    return html;
  } catch(e) {
    await browser.close();
    throw e;
  }
}

const results=[];

// ===== Target 1: TrollAndToad correct URLs =====
console.log('\n[T1] TrollAndToad fixed URLs via proxy-curl...');
const tntPokemon='https://www.trollandtoad.com/pokemon-tcg/pokemon-sealed-products/22540';
const tntMtg='https://www.trollandtoad.com/magic-the-gathering/magic-sealed-product/22536';
for(const [name,url,cat] of [['TrollAndToad Pokemon Sealed',tntPokemon,'pokemon'],['TrollAndToad MTG Sealed',tntMtg,'mtg']]) {
  const proxy=proxies[pi++%proxies.length];
  const html=curlProxy(url,proxy,20);
  const prices=extractPrices(html);
  const has=html.length>1000&&prices.length>0;
  console.log(`  ${name}: ${has?'✅':'❌'} ${prices.slice(0,5).join(', ')} (${html.length}b)`);
  console.log(`  snippet: ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,200)}`);
  results.push({name,url,cat,works:has,prices,method:'proxy-curl'});
}

// ===== Target 2: CoolStuffInc fixed URLs =====
console.log('\n[T2] CoolStuffInc via proxy-curl...');
for(const [name,url,cat] of [
  ['CoolStuffInc Pokemon Sealed','https://www.coolstuffinc.com/c/PokemonTCG?q=booster+box&instock=1','pokemon'],
  ['CoolStuffInc MTG Sealed','https://www.coolstuffinc.com/c/MagictheGathering?q=collector+booster&instock=1','mtg'],
  ['CoolStuffInc One Piece','https://www.coolstuffinc.com/c/OnePieceTCG?q=booster+box&instock=1','one_piece'],
]) {
  const proxy=proxies[pi++%proxies.length];
  const html=curlProxy(url,proxy,20);
  const prices=extractPrices(html);
  const has=html.length>1000&&prices.length>0;
  console.log(`  ${name}: ${has?'✅':'❌'} prices=${prices.slice(0,5).join(', ')} (${html.length}b)`);
  console.log(`  snippet: ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,200)}`);
  results.push({name,url,cat,works:has,prices,method:'proxy-curl'});
}

// ===== Target 3: CardKingdom fixed search =====
console.log('\n[T3] CardKingdom search via proxy-curl...');
for(const [name,url,cat] of [
  ['CardKingdom MTG Collector Booster Boxes','https://www.cardkingdom.com/catalog/magic_sealed_product/list?filter[sort]=name_asc&filter[search]=search&filter[term]=collector+booster+box','mtg'],
]) {
  const proxy=proxies[pi++%proxies.length];
  const html=curlProxy(url,proxy,20);
  const prices=extractPrices(html);
  const has=html.length>1000&&prices.length>0;
  console.log(`  ${name}: ${has?'✅':'❌'} prices=${prices.slice(0,8).join(', ')} (${html.length}b)`);
  console.log(`  snippet: ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,250)}`);
  results.push({name,url,cat,works:has,prices,method:'proxy-curl'});
}

// ===== Target 4: ICv2 fixed URLs =====
console.log('\n[T4] ICv2 product-announcement articles...');
for(const [name,url,cat] of [
  ['ICv2 Pokemon product news','https://icv2.com/articles/news/view/60000/pokemon-trading-card-game','pokemon'],
  ['ICv2 MTG product news','https://icv2.com/articles/news/view/60000/magic-the-gathering','mtg'],
  ['ICv2 TCG products search','https://icv2.com/articles/search?searchterm=booster+box+msrp','all'],
]) {
  const html=curlProxy(url,proxies[pi++%proxies.length],15);
  const prices=extractPrices(html);
  const has=html.length>500&&(prices.length>0||/MSRP/i.test(html));
  console.log(`  ${name}: ${has?'✅':'❌'} prices=${prices.join(', ')||'none'} (${html.length}b)`);
  console.log(`  snippet: ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,200)}`);
  results.push({name,url,cat,works:has,prices,method:'proxy-curl'});
}

// ===== Target 5: MTGGoldfish fixed URL =====
console.log('\n[T5] MTGGoldfish sealed prices...');
{
  const url='https://www.mtggoldfish.com/sets/sealed';
  const html=curlProxy(url,proxies[pi++%proxies.length],20);
  const prices=extractPrices(html);
  const has=html.length>1000&&prices.length>0;
  console.log(`  MTGGoldfish sealed: ${has?'✅':'❌'} prices=${prices.slice(0,6).join(', ')} (${html.length}b)`);
  console.log(`  snippet: ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,300)}`);
  results.push({name:'MTGGoldfish sealed',url,cat:'mtg',works:has,prices,method:'proxy-curl'});
}

// ===== Target 6: Playwright — Topps.com =====
console.log('\n[T6] Playwright — Topps.com (Cloudflare)...');
try {
  const html=await playwrightFetch('https://www.topps.com/collections/all?sort_by=price-descending',pi++,'[data-price],[class*="price"]',5000);
  const prices=extractPrices(html);
  const has=prices.length>0&&/topps|baseball|box/i.test(html);
  console.log(`  Topps: ${has?'✅':'❌'} prices=${prices.slice(0,8).join(', ')} (${html.length}b)`);
  const prods=html.match(/[\w\s]+(box|pack|hobby|blaster)[\w\s]*/gi)?.slice(0,5)||[];
  console.log(`  Products found: ${prods.join(' | ')}`);
  results.push({name:'Topps.com',url:'https://www.topps.com/collections/all',cat:'topps',works:has,prices,method:'playwright'});
} catch(e) { console.log(`  Topps: ❌ ${e.message.slice(0,80)}`); }

// ===== Target 7: Playwright — Amazon stx-cbb =====
console.log('\n[T7] Playwright — Amazon B0GFDD1RLS (Secrets of Strixhaven)...');
try {
  const html=await playwrightFetch('https://www.amazon.com/dp/B0GFDD1RLS',pi++,'#priceblock_ourprice,#price_inside_buybox,.a-price',5000);
  const prices=extractPrices(html);
  const has=prices.length>0&&/strixhaven|collector/i.test(html);
  console.log(`  Amazon STX: ${has?'✅':'❌'} prices=${prices.slice(0,6).join(', ')} (${html.length}b)`);
  const titleMatch=html.match(/<title[^>]*>(.*?)<\/title>/i);
  console.log(`  Title: ${titleMatch?titleMatch[1].slice(0,100):'(none)'}`);
  results.push({name:'Amazon STX Strixhaven',url:'https://www.amazon.com/dp/B0GFDD1RLS',cat:'mtg',works:has,prices,method:'playwright'});
} catch(e) { console.log(`  Amazon: ❌ ${e.message.slice(0,80)}`); }

// ===== Target 8: Playwright — CoolStuffInc =====
console.log('\n[T8] Playwright — CoolStuffInc Pokemon sealed...');
try {
  const html=await playwrightFetch('https://www.coolstuffinc.com/main_pokemon.php?s=booster+box',pi++,'.item',4000);
  const prices=extractPrices(html);
  const has=prices.length>0;
  console.log(`  CoolStuffInc: ${has?'✅':'❌'} prices=${prices.slice(0,8).join(', ')} (${html.length}b)`);
  console.log(`  snippet: ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,300)}`);
  results.push({name:'CoolStuffInc PW',url:'https://www.coolstuffinc.com/main_pokemon.php?s=booster+box',cat:'pokemon',works:has,prices,method:'playwright'});
} catch(e) { console.log(`  CoolStuffInc: ❌ ${e.message.slice(0,80)}`); }

// ===== Target 9: Playwright — CardKingdom =====
console.log('\n[T9] Playwright — CardKingdom MTG sealed...');
try {
  const html=await playwrightFetch('https://www.cardkingdom.com/catalog/magic_sealed_product',pi++,'.productItemWrapper',4000);
  const prices=extractPrices(html);
  const has=prices.length>0&&/collector|booster|box/i.test(html);
  console.log(`  CardKingdom: ${has?'✅':'❌'} prices=${prices.slice(0,8).join(', ')} (${html.length}b)`);
  results.push({name:'CardKingdom MTG',url:'https://www.cardkingdom.com/catalog/magic_sealed_product',cat:'mtg',works:has,prices,method:'playwright'});
} catch(e) { console.log(`  CardKingdom: ❌ ${e.message.slice(0,80)}`); }

// ===== Target 10: One Piece deeper — booster box specific =====
console.log('\n[T10] One Piece booster box specific pages...');
for(const [setcode,name,expected] of [
  ['OP-10','OP10 Royal Blood','$120'],
  ['OP-12','OP12','$120'],
  ['EB-05','EB-05','$4.99'],
]) {
  try {
    const url=`https://en.onepiece-cardgame.com/products/?subcategory=boosters&series=${setcode}`;
    const html=curlProxy(url,proxies[pi++%proxies.length],15);
    const prices=extractPrices(html);
    console.log(`  OP ${setcode}: prices=${prices.join(', ')||'none'} (${html.length}b)`);
    // also try direct product lookup
    const url2=`https://en.onepiece-cardgame.com/products/?subcategory=boosterbox`;
    const html2=curlProxy(url2,proxies[pi++%proxies.length],15);
    const prices2=extractPrices(html2);
    console.log(`  OP boosterbox page: prices=${prices2.join(', ')||'none'} (${html2.length}b)`);
    console.log(`  snippet: ${html2.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,400)}`);
    break; // one attempt sufficient
  } catch(e) { console.log(`  OP: ${e.message.slice(0,60)}`); }
}

// ===== Target 11: Ravensburger with Playwright =====
console.log('\n[T11] Playwright — Ravensburger Lorcana...');
try {
  const html=await playwrightFetch('https://www.ravensburger.us/en-US/disney-lorcana/',pi++,null,4000);
  const prices=extractPrices(html);
  console.log(`  Ravensburger: prices=${prices.slice(0,6).join(', ')||'none'} (${html.length}b)`);
  console.log(`  snippet: ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,300)}`);
  results.push({name:'Ravensburger Lorcana',url:'https://www.ravensburger.us/en-US/disney-lorcana/',cat:'lorcana',works:prices.length>0,prices,method:'playwright'});
} catch(e) { console.log(`  Ravensburger: ❌ ${e.message.slice(0,80)}`); }

// ===== Summary =====
console.log('\n\n=== ROUND 2 RESULTS ===');
const working=results.filter(r=>r.works);
const notWorking=results.filter(r=>!r.works);
console.log(`\n✅ WORKING (${working.length}):`);
working.forEach(r=>console.log(`  - ${r.name} [${r.cat}] via ${r.method}: ${r.prices.slice(0,5).join(', ')}`));
console.log(`\n❌ NOT WORKING (${notWorking.length}):`);
notWorking.forEach(r=>console.log(`  - ${r.name} [${r.cat}]`));

writeFileSync('msrp-probe-round2.json',JSON.stringify(results,null,2));
console.log('\nResults → msrp-probe-round2.json');
