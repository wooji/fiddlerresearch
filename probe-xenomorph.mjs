const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function go() {
  // 1. Mattel Creations search - multiple queries
  console.log('=== MATTEL CREATIONS SEARCH ===');
  const queries = ['alien xenomorph', 'xenomorph doll', 'alien monster high', 'alien collab'];
  for (const q of queries) {
    const r = await fetch(`https://creations.mattel.com/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=5`, { headers: { 'User-Agent': UA } });
    const d = await r.json();
    const p = d?.resources?.results?.products || [];
    if (p.length) {
      console.log(`\nq="${q}":`);
      p.forEach(x => console.log(`  ${x.title} | ${x.url} | $${(x.price/100).toFixed(2)}`));
    } else {
      console.log(`q="${q}": no results`);
    }
  }

  // 2. Mattel Creations collabs collection
  console.log('\n=== MATTEL CREATIONS COLLABS ===');
  const r2 = await fetch('https://creations.mattel.com/collections/all.json?limit=20&sort_by=created-descending', { headers: { 'User-Agent': UA } });
  const d2 = await r2.json();
  const prods = d2.products || [];
  const alien = prods.filter(p => /alien|xenomorph/i.test(p.title));
  if (alien.length) alien.forEach(p => console.log(p.title, '|', p.handle, '| $'+p.variants?.[0]?.price));
  else console.log('Not in recent "all" collection — checking via direct URL patterns...');

  // 3. Try direct URL patterns
  console.log('\n=== DIRECT URL PROBE ===');
  const candidates = [
    'monster-high-alien-xenomorph',
    'alien-xenomorph-monster-high',
    'monster-high-x-alien',
    'alien-x-monster-high',
    'skullector-alien-xenomorph',
    'monster-high-skullector-alien',
  ];
  for (const handle of candidates) {
    const r = await fetch(`https://creations.mattel.com/products/${handle}.json`, { headers: { 'User-Agent': UA } });
    if (r.ok) {
      const d = await r.json();
      console.log('FOUND:', d.product.title, '| $'+d.product.variants?.[0]?.price);
    } else {
      console.log(`${r.status}: ${handle}`);
    }
  }

  // 4. Mattel.com product search
  console.log('\n=== MATTEL.COM SEARCH ===');
  const r3 = await fetch('https://www.mattel.com/en-us/search?q=alien+xenomorph+monster+high', { headers: { 'User-Agent': UA } });
  const html3 = await r3.text();
  const titleMatch = html3.match(/<title>([^<]+)/);
  console.log('Title:', titleMatch?.[1]);
  const hasXeno = /xenomorph|alien.*monster.high|monster.high.*alien/i.test(html3);
  console.log('Has xenomorph content:', hasXeno);

  // 5. Reddit search
  console.log('\n=== REDDIT ===');
  const subs = ['MonsterHigh', 'Dolls', 'ActionFigures'];
  for (const sub of subs) {
    const r = await fetch(`https://reddit.com/r/${sub}/search.json?q=alien+xenomorph+mattel&sort=new&limit=5&restrict_sr=1`, { headers: { 'User-Agent': 'fiddler-research/1.0' } });
    if (!r.ok) continue;
    const j = await r.json();
    const posts = j?.data?.children || [];
    if (posts.length) {
      console.log(`\nr/${sub}:`);
      posts.forEach(p => console.log(`  [${p.data.score}] ${p.data.title}`));
    }
    await new Promise(res => setTimeout(res, 700));
  }
}

go().catch(e => console.error(e.message));
