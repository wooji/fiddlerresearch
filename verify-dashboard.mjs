import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const consoleLogs = [];
page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));

const networkCalls = [];
page.on('request', req => { if (req.url().includes('/api/')) networkCalls.push(req.method()+' '+req.url().replace('http://localhost:3434','')); });

await page.goto('http://localhost:3434');
await page.waitForTimeout(1500);

await page.fill('#rk-name', 'Disney Lorcana Wilds Unknown Booster Box');
await page.dispatchEvent('#rk-name', 'input');
await page.waitForTimeout(1500);

console.log('Run btn:', await page.$eval('#run-btn', b => b.textContent.trim()));
await page.click('#run-btn');
console.log('Clicked Run — polling dots for 60s\n');

// Poll every 3s for 60s
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  const dots = await page.evaluate(() =>
    [...document.querySelectorAll('[id^="dot-"]')].map(d => ({
      id: d.id.replace('dot-',''),
      cls: d.className.replace('dot ','').trim(),
      txt: (document.getElementById(d.id.replace('dot-','cd-'))?.textContent || '').trim().slice(0,30)
    }))
  );

  // count by status
  const counts = {};
  dots.forEach(d => { counts[d.cls] = (counts[d.cls]||0)+1; });
  const summary = Object.entries(counts).map(([k,v])=>`${k}:${v}`).join(' ');
  const changed = dots.filter(d => d.cls !== 'pending' && d.cls !== '');
  console.log(`T+${(i+1)*3}s [${summary}]  changed: ${changed.map(d=>`${d.id}=${d.cls}(${d.txt})`).join(', ')||'none'}`);

  const allTerminal = dots.length > 0 && dots.every(d => ['ok','na','err','skip'].includes(d.cls));
  if (allTerminal) { console.log('All terminal — done early'); break; }
}

// Final state
console.log('\nFINAL DOT STATES:');
const finalDots = await page.evaluate(() =>
  [...document.querySelectorAll('[id^="dot-"]')].map(d => ({
    id: d.id.replace('dot-',''),
    cls: d.className.replace('dot ','').trim(),
    txt: (document.getElementById(d.id.replace('dot-','cd-'))?.textContent||'').trim()
  }))
);
finalDots.forEach(d => console.log(`  ${d.id.padEnd(12)} ${d.cls.padEnd(10)} ${d.txt}`));

console.log('\nNetwork calls:', networkCalls);

const errors = consoleLogs.filter(l => l.startsWith('[error]') || l.startsWith('[pageerror]'));
if (errors.length) { console.log('\nJS ERRORS:'); errors.forEach(e => console.log(' ',e)); }

await browser.close();
