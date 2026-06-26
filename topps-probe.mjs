import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = 'C:/Users/Christopher/CodexProjects/jester-researcher';
const proxies = readFileSync(join(ROOT,'proxies-mobilemix.txt'),'utf8')
  .trim().split('\n').filter(l=>l.includes('GRX35821')).slice(0,5);

for(const raw of proxies) {
  const [host,port,user,pass] = raw.split(':');
  console.log('trying', host+':'+port);
  const browser = await chromium.launch({
    headless:true,
    proxy: { server:`http://${host}:${port}`, username:user, password:pass }
  });
  try {
    const ctx = await browser.newContext({
      userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
      locale:'en-US'
    });
    const page = await ctx.newPage();
    const res = await page.goto('https://www.topps.com/collections/disney/products.json?limit=10', {timeout:30000,waitUntil:'domcontentloaded'});
    console.log('status:', res.status());
    if(res.status()===200) {
      const text = await page.evaluate(()=>document.body.innerText);
      const j = JSON.parse(text);
      j.products?.slice(0,8).forEach(p=>{
        const v = p.variants?.[0];
        console.log('$'+(v?.price||'?'), p.title?.slice(0,70));
      });
      await browser.close();
      break;
    }
  } catch(e){ console.log('err:',e.message.slice(0,100)); }
  finally { try{await browser.close();}catch{} }
  await new Promise(r=>setTimeout(r,800));
}
