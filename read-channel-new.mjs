const TOKEN = process.env.DISCORD_USER_TOKEN;
const CHANNELS = ['1516298588261585097'];
const LIMIT = 50;

for (const ch of CHANNELS) {
  console.log(`\n${'='.repeat(60)}\nCHANNEL: ${ch}\n${'='.repeat(60)}`);
  const r = await fetch(`https://discord.com/api/v10/channels/${ch}/messages?limit=${LIMIT}`, {
    headers: { Authorization: TOKEN }
  });
  if (!r.ok) { console.log('ERR', r.status, await r.text()); continue; }
  const msgs = await r.json();
  for (const m of msgs.reverse()) {
    const ts = m.timestamp?.slice(0, 10);
    const author = m.author?.username;
    const content = m.content?.slice(0, 400);
    const embeds = m.embeds?.map(e => {
      const parts = [e.title, e.description, ...((e.fields||[]).map(f => `${f.name}: ${f.value}`))];
      return parts.filter(Boolean).join(' | ').slice(0, 800);
    }).join('\n  EMBED: ');
    if (content) console.log(`[${ts}] ${author}: ${content}`);
    if (embeds) console.log(`  EMBED: ${embeds}`);
  }
}
