import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('C:/Users/Christopher/CodexProjects/hook-reader/.env', 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);

// Try user token on the Fiddler output channel
const headers = { 'Authorization': env.DISCORD_USER_TOKEN, 'User-Agent': 'Mozilla/5.0' };
const r = await fetch('https://discord.com/api/v9/channels/1516298588261585097/messages?limit=50&around=1516305109578023002', { headers });
const msgs = await r.json();
if (!Array.isArray(msgs)) { console.log('Error:', JSON.stringify(msgs)); process.exit(1); }
console.log(`${msgs.length} messages\n`);
msgs.forEach(m => {
  const titles = m.embeds?.map(e => e.title).filter(Boolean).join(', ') ?? '';
  const allFields = m.embeds?.flatMap(e => e.fields ?? []).map(f => `  [${f.name}]: ${f.value?.slice(0,120)}`).join('\n') ?? '';
  console.log(`ID:${m.id} [${m.timestamp?.slice(0,10)}]${titles ? ` EMBED: ${titles}` : ` content: ${m.content?.slice(0,100)}`}`);
  if (allFields) console.log(allFields);
  console.log();
});
