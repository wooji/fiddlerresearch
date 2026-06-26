import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const env = Object.fromEntries(
  readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})
);

const CHATBOT_ID = 'cmg9ns8ph07jc0y3t2r2051t3';
const BASE = 'https://dealernet-bot.zapier.app/api/proxy/interfaces/api/interfaces/v0/chatbots';

// Init session
const initResp = await fetch(`${BASE}/${CHATBOT_ID}/init`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
const init = await initResp.json();
console.log('Init:', JSON.stringify(init).slice(0, 400));

const sessionId = init?.sessionId ?? init?.id;
console.log('Session ID:', sessionId);

if (sessionId) {
  // Send a query about 2024 Topps Inception pricing
  const msgResp = await fetch(`${BASE}/${CHATBOT_ID}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What were the wholesale prices for 2024 Topps Inception Baseball hobby boxes on DealernetX? Show me historical pricing.' }),
  });
  const msg = await msgResp.json();
  console.log('\nChat response:', JSON.stringify(msg).slice(0, 1000));

  // Also try a direct product search query
  await new Promise(r => setTimeout(r, 2000));
  const searchResp = await fetch(`${BASE}/${CHATBOT_ID}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Search for 2024 Topps Inception Baseball and show prices' }),
  });
  const search = await searchResp.json();
  console.log('\nSearch response:', JSON.stringify(search).slice(0, 1000));
}
