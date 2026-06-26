import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const env = Object.fromEntries(
  readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let sessionId = null;
let fullInitBody = null;

page.on('request', req => {
  if (req.method() === 'POST' && req.url().includes('/init')) {
    fullInitBody = req.postData();
  }
});
page.on('response', async resp => {
  if (resp.url().includes('/init')) {
    try {
      const d = await resp.json();
      sessionId = d?.chatbotSessionId;
      console.log('chatbotSessionId:', sessionId);
    } catch {}
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
await browser.close();

console.log('Full init body:', fullInitBody?.slice(0, 1200));

if (!sessionId || !fullInitBody) { console.log('Missing session/body'); process.exit(1); }

const CHATBOT_ID = 'cmg9ns8ph07jc0y3t2r2051t3';
const BASE = 'https://dealernet-bot.zapier.app/api/proxy/interfaces/api/interfaces/v0/chatbots';

const queries = [
  'What were the recent wholesale prices for 2024 Topps Inception Baseball hobby boxes? Show me pricing data.',
  'Search for Topps Inception Baseball 2024. What is the asking price per box?',
];

for (const q of queries) {
  console.log(`\nQuery: "${q}"`);
  const r = await fetch(`${BASE}/${CHATBOT_ID}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://dealernet-bot.zapier.app', 'Referer': 'https://dealernet-bot.zapier.app/' },
    body: JSON.stringify({ message: q }),
  });
  const text = await r.text();
  console.log('Status:', r.status);
  console.log('Response:', text.slice(0, 1000));
  await new Promise(r => setTimeout(r, 2500));
}
