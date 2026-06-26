const TOKEN = process.env.DISCORD_USER_TOKEN;
const CHANNELS = ['862416675873751050', '1247959380704366753'];
const LIMIT = 20;

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
    const content = m.content?.slice(0, 500);
    const embeds = m.embeds?.map(e => {
      const parts = [e.title, e.description, ...((e.fields||[]).map(f => `${f.name}: ${f.value}`))];
      return parts.filter(Boolean).join(' | ').slice(0, 400);
    }).join('\n  EMBED: ');
    console.log(`[${ts}] ${author}: ${content}`);
    if (embeds) console.log(`  EMBED: ${embeds}`);
  }
}
