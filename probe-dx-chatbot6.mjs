import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const env = Object.fromEntries(
  readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let sessionId = null;
let chatbotApiBase = null;
const msgResponses = [];

page.on('request', req => {
  if (req.method() === 'POST' && req.url().includes('/init')) chatbotApiBase = req.url().replace('/init','');
});
page.on('response', async resp => {
  if (resp.url().includes('/init')) {
    try { const d = await resp.json(); sessionId = d?.chatbotSessionId; } catch {}
  }
  if (resp.url().includes('/messages')) {
    try { msgResponses.push(await resp.json()); } catch {}
  }
});

await page.goto('https://www.dealernetx.com/login.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(500);
await page.evaluate(({user,pass}) => {
  document.querySelector('input[name="userName"]').value = user;
  document.querySelector('input[name="userPass"]').value = pass;
  document.querySelector('button[name="loginBtn"]').click();
}, { user: env.DEALERNET_USER, pass: env.DEALERNET_PASS });
await page.waitForTimeout(4000);

console.log('Session ID:', sessionId, '| API Base:', chatbotApiBase?.slice(50));

if (sessionId && chatbotApiBase) {
  const msgUrl = `${chatbotApiBase}/sessions/${sessionId}/messages`;
  const queries = [
    'Show me current listings and prices for 2024 Topps Inception Baseball hobby boxes.',
    'What is the wholesale asking price history for Topps Inception Baseball? Show 2023 and 2024 data.',
  ];
  for (const q of queries) {
    console.log(`\nQuery: "${q}"`);
    // Send via page route (avoids CORS)
    const result = await page.evaluate(async ({url, message}) => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        return { status: r.status, body: await r.text() };
      } catch(e) { return { error: e.message }; }
    }, { url: msgUrl, message: q });
    console.log('Status:', result.status, 'Error:', result.error);
    console.log('Response:', result.body?.slice(0, 800));
    await page.waitForTimeout(3000);
  }
}

console.log('\nIntercepted message responses:', msgResponses.length);
msgResponses.forEach(r => console.log(JSON.stringify(r).slice(0,500)));

await browser.close();
