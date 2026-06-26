/**
 * One-time StockX OAuth refresh-token grab.
 * Run: node stockx-auth.mjs
 * 1. Opens browser to StockX login.
 * 2. After login it redirects to https://localhost/callback?code=XXXX (page fails to load — fine).
 * 3. Copy the FULL url bar value, paste here when prompted.
 * 4. Script exchanges code → tokens, writes STOCKX_REFRESH_TOKEN into .env.
 */
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { exec } from 'child_process';

const ENV = './.env';
const env = Object.fromEntries(
  readFileSync(ENV, 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const CLIENT_ID     = env.STOCKX_CLIENT_ID;
const CLIENT_SECRET = env.STOCKX_CLIENT_SECRET;
const REDIRECT      = 'https://localhost/callback';
const AUDIENCE      = 'gateway.stockx.com';
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('Missing STOCKX_CLIENT_ID/SECRET in .env'); process.exit(1); }

const authUrl = `https://accounts.stockx.com/authorize?` + new URLSearchParams({
  response_type: 'code',
  client_id:     CLIENT_ID,
  redirect_uri:  REDIRECT,
  scope:         'offline_access openid',
  audience:      AUDIENCE,
  state:         'fiddler',
}).toString();

console.log('\nOpening browser. Log in, approve, then copy the FULL redirected URL.\n', authUrl, '\n');
exec(`start "" "${authUrl}"`, { shell: 'powershell.exe' });

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste redirected URL (or just the code): ', async (ans) => {
  rl.close();
  let code = ans.trim();
  const m = code.match(/[?&]code=([^&]+)/);
  if (m) code = decodeURIComponent(m[1]);
  if (!code) { console.error('No code found.'); process.exit(1); }

  const r = await fetch('https://accounts.stockx.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri:  REDIRECT,
    }),
  });
  if (!r.ok) { console.error(`Token exchange ${r.status}:`, await r.text()); process.exit(1); }
  const j = await r.json();
  if (!j.refresh_token) { console.error('No refresh_token in response:', j); process.exit(1); }

  let txt = readFileSync(ENV, 'utf8');
  txt = txt.includes('STOCKX_REFRESH_TOKEN=')
    ? txt.replace(/STOCKX_REFRESH_TOKEN=.*/g, `STOCKX_REFRESH_TOKEN=${j.refresh_token}`)
    : txt + `\nSTOCKX_REFRESH_TOKEN=${j.refresh_token}\n`;
  writeFileSync(ENV, txt);
  console.log('\n✅ STOCKX_REFRESH_TOKEN saved to .env. Access token valid; refresh persists.');
});
