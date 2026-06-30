import { readFileSync } from 'node:fs';
const TOKEN=((readFileSync('.env','utf8').match(/DISCORD_USER_TOKEN=(.*)/)||[])[1]||'').trim().replace(/['"\r]/g,'');
const MSG='1518634811059736596'; const G='1501306268827123712'; const H={headers:{Authorization:TOKEN}};
const chs = await (await fetch(`https://discord.com/api/v10/guilds/${G}/channels`,H)).json();
console.log('NOWARE channels:', chs.map(c=>`${c.name}(${c.type})`).join(', '));
for (const c of chs) {
  // probe channel itself
  let r = await fetch(`https://discord.com/api/v10/channels/${c.id}/messages/${MSG}`,H);
  if (r.status===200){const m=await r.json();console.log('FOUND in',c.name);console.log(JSON.stringify(m).slice(0,3500));process.exit(0);}
  // archived public threads
  for (const kind of ['public','private']) {
    try {
      const a = await fetch(`https://discord.com/api/v10/channels/${c.id}/threads/archived/${kind}`,H);
      if (a.status!==200) continue;
      const j = await a.json();
      for (const t of (j.threads||[])) {
        const tr = await fetch(`https://discord.com/api/v10/channels/${t.id}/messages/${MSG}`,H);
        if (tr.status===200){const m=await tr.json();console.log('FOUND in thread',t.name,'of',c.name);console.log(JSON.stringify(m).slice(0,3500));process.exit(0);}
      }
    } catch {}
  }
}
console.log('not found in NOWARE channels/threads');
