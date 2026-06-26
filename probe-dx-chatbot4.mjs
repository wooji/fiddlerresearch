import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const env = Object.fromEntries(
  readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let capturedInit = null;
let capturedSessionId = null;
let capturedChatbotPageId = null;
let capturedChatbotId2 = null;

page.on('request', req => {
  if (req.method() === 'POST' && req.url().includes('chatbots') && req.url().includes('init')) {
    capturedInit = { url: req.url(), body: req.postData() };
  }
});
page.on('response', async resp => {
  if (resp.url().includes('chatbots') && resp.url().includes('init')) {
    try {
      const data = await resp.json();
      console.log('Init response keys:', Object.keys(data));
      console.log('Init response:', JSON.stringify(data).slice(0,600));
      capturedSessionId = data?.sessionId ?? data?.session?.id ?? data?.id;
      capturedChatbotPageId = data?.chatbotPageId ?? data?.pageId;
    } catch(e) { console.log('Init parse err:', e.message); }
  }
  if (resp.url().includes('sessions') && !resp.url().includes('messages') && !resp.url().includes('suggestions')) {
    try {
      const data = await resp.json();
      console.log('Session response:', JSON.stringify(data).slice(0,400));
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
await page.waitForTimeout(4000); // wait for chatbot to init on page load

console.log('\n=== Captured Init ===');
console.log('URL:', capturedInit?.url);
console.log('Body (first 800):', capturedInit?.body?.slice(0, 800));
console.log('Session ID:', capturedSessionId);

// Now use captured session to send a message directly via fetch
if (capturedSessionId && capturedInit) {
  const chatbotId = capturedInit.url.match(/chatbots\/([^\/]+)\/init/)?.[1];
  console.log('\nChatbot ID from URL:', chatbotId);

  const msgUrl = capturedInit.url.replace('/init', `/sessions/${capturedSessionId}/messages`);
  console.log('Sending message to:', msgUrl);

  // Use page.evaluate to make the fetch from within the browser context (has session cookies)
  const result = await page.evaluate(async ({ url, sessionId }) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What were recent wholesale prices for 2024 Topps Inception Baseball hobby boxes on DealernetX?' }),
    });
    return await r.text();
  }, { url: msgUrl, sessionId: capturedSessionId });

  console.log('\nChat response:', result.slice(0, 1000));
}

await browser.close();
