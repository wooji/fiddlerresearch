const TOKEN = 'MzM4NzQ1NDIwNzY5NTI1NzYw.GbJLtS.KjpJvTOEeULojBkMkeLHnKaRNgcFqLLU__SJWA';
const CHANNEL = '1516298588261585097';
const MSG_ID  = '1516443636756250775';

const r = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages?around=${MSG_ID}&limit=5`, {
  headers: { Authorization: TOKEN }
});
if (!r.ok) { console.log('ERR', r.status, await r.text()); process.exit(1); }
const msgs = await r.json();
for (const m of msgs) {
  console.log(`\n[${m.id}] ${m.timestamp?.slice(0,10)} ${m.author?.username}`);
  if (m.content) console.log('CONTENT:', m.content.slice(0, 1000));
  for (const e of (m.embeds ?? [])) {
    const parts = [e.title, e.description, ...(e.fields ?? []).map(f => `${f.name}: ${f.value}`)];
    console.log('EMBED:', parts.filter(Boolean).join(' | ').slice(0, 1200));
  }
}
