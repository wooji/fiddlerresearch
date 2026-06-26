import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const env = Object.fromEntries(
  readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Capture all POST bodies to chatbot API
const chatbotRequests = [];
page.on('request', req => {
  if (req.url().includes('chatbot') && req.method() === 'POST') {
    chatbotRequests.push({ url: req.url(), body: req.postData()?.slice(0, 500) });
  }
});
const chatbotResponses = [];
page.on('response', async resp => {
  if (resp.url().includes('chatbot') || resp.url().includes('sessions')) {
    try { chatbotResponses.push({ url: resp.url(), body: (await resp.text()).slice(0, 800) }); } catch {}
  }
});

await page.goto('https://www.dealernetx.com/login.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(500);
await page.evaluate(({user,pass}) => {
  document.querySelector('input[name="userName"]').value = user;
  document.querySelector('input[name="userPass"]').value = pass;
  document.querySelector('button[name="loginBtn"]').click();
}, { user: env.DEALERNET_USER, pass: env.DEALERNET_PASS });
await page.waitForTimeout(3000);

// Navigate to listings page (even though blocked, chatbot should load)
await page.goto('https://www.dealernetx.com/offers.php?offerfilter=PURCHASESALL', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);

// Try clicking the chatbot button
const chatBtn = page.locator('[id*="chatbot"], [class*="chatbot"], button:has-text("chat"), .zapier').first();
if (await chatBtn.isVisible({ timeout: 3000 }).catch(()=>false)) {
  await chatBtn.click();
  await page.waitForTimeout(2000);
}

// Try sending a message via the chatbot iframe
const frames = page.frames();
console.log('Frames:', frames.map(f=>f.url().slice(0,80)));

for (const frame of frames) {
  if (frame.url().includes('zapier') || frame.url().includes('chatbot')) {
    console.log('Found chatbot frame:', frame.url());
    const input = frame.locator('input[type="text"], textarea').first();
    if (await input.isVisible({timeout:2000}).catch(()=>false)) {
      await input.fill('What is the current wholesale price for 2024 Topps Inception Baseball hobby boxes?');
      await input.press('Enter');
      await page.waitForTimeout(4000);
      const response = await frame.evaluate(() => document.body.innerText.slice(0, 2000));
      console.log('Chatbot UI response:', response.slice(0, 500));
    }
  }
}

console.log('\n=== Chatbot POST requests ===');
chatbotRequests.forEach(r => console.log(r.url.slice(50), '\nBody:', r.body));
console.log('\n=== Chatbot responses ===');
chatbotResponses.forEach(r => console.log(r.url.slice(50), '\nBody:', r.body.slice(0,400), '\n'));

await browser.close();
