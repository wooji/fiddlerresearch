const CHATBOT_ID = 'cmg9ns8ph07jc0y3t2r2051t3';
const BASE = 'https://dealernet-bot.zapier.app/api/proxy/interfaces/api/interfaces/v0/chatbots';

const initPayload = {
  chatbotId: 'cmg9ns8ph07jc0y3t2r2051t3',
  configParams: {
    params: { isPopup: 'true', projectSlug: 'dealernet-bot', pageId: 'cmg9ns9os000i10hbv7ljutaa', chatbotId: 'cmg9ns9pt000k10hbyvt3ndxt' },
    locale: 'en-US'
  },
  theme: { preset: 'Custom', mode: 'Light', radius: '0.5rem', brandColor: '#3464FC', background: '#EEF4FF', foreground: '#2C3E50', card: '#FFFFFF', cardForeground: '#2C3E50', popover: '#FFFFFF', popoverForeground: '#2C3E50', primary: '#3464FC', primaryForeground: '#FFFFFF', secondary: '#F5F5F5', secondaryForeground: '#2C3E50' }
};

console.log('Initializing chatbot session...');
const initResp = await fetch(`${BASE}/${CHATBOT_ID}/init`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Origin': 'https://dealernet-bot.zapier.app', 'Referer': 'https://dealernet-bot.zapier.app/' },
  body: JSON.stringify(initPayload),
});
const init = await initResp.json();
console.log('Init response:', JSON.stringify(init).slice(0, 600));

const sessionId = init?.sessionId ?? init?.session?.id ?? init?.id;
console.log('Session ID:', sessionId);

if (sessionId) {
  const queries = [
    'What is the current wholesale asking price for 2024 Topps Inception Baseball hobby boxes?',
    'Show me recent DealernetX sales for 2024 Topps Inception Baseball. What did boxes sell for?',
  ];
  for (const q of queries) {
    console.log(`\nQuery: "${q}"`);
    const r = await fetch(`${BASE}/${CHATBOT_ID}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://dealernet-bot.zapier.app' },
      body: JSON.stringify({ message: q }),
    });
    const data = await r.json();
    console.log('Response:', JSON.stringify(data).slice(0, 800));
    await new Promise(r => setTimeout(r, 2000));
  }
}
