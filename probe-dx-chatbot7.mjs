import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const env = Object.fromEntries(
  readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})
);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

let sessionId = null;
let chatbotApiBase = null;
const msgResponses = [];

context.on('request', req => {
  if (req.method() === 'POST' && req.url().includes('/init')) chatbotApiBase = req.url().replace('/init','');
});
context.on('response', async resp => {
  if (resp.url().includes('/init')) {
    try { const d = await resp.json(); sessionId = d?.chatbotSessionId; } catch {}
  }
  if (resp.url().includes('/messages')) {
    try { const d = await resp.json(); msgResponses.push({ url: resp.url().slice(-60), data: d }); } catch {}
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

console.log('Session ID:', sessionId, '| Base:', chatbotApiBase?.slice(50));

// Find the chatbot iframe
const frames = context.pages().flatMap(p => p.frames());
const chatFrame = frames.find(f => f.url().includes('dealernet-bot.zapier') || f.url().includes('chatbot'));
console.log('Frames found:', frames.length, '| Chatbot frame:', chatFrame?.url().slice(0,80));

if (chatFrame) {
  // Wait for chatbot to load and find the input
  await chatFrame.waitForTimeout?.(1000);
  const input = chatFrame.locator('input[type="text"], textarea, [contenteditable="true"]').first();
  const isVis = await input.isVisible({ timeout: 5000 }).catch(()=>false);
  console.log('Input visible:', isVis);
  if (isVis) {
    await input.fill('Show me current wholesale listings and prices for 2024 Topps Inception Baseball hobby boxes.');
    await input.press('Enter');
    await page.waitForTimeout(6000);
    const frameText = await chatFrame.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('Chatbot response UI:', frameText.slice(0, 800));
  }
}

console.log('\nIntercepted responses:', msgResponses.length);
msgResponses.forEach(r => console.log(r.url, '\n', JSON.stringify(r.data).slice(0,600)));

await browser.close();
