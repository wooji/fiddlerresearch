const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function redditSearch(q) {
  const subs = ['pkmntcg', 'PokemonTCG', 'pokemoncardcollectors', 'pokemoncards'];
  const results = [];
  for (const sub of subs) {
    const r = await fetch(`https://reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&sort=new&limit=5&restrict_sr=1`, {
      headers: { 'User-Agent': 'fiddler-research/1.0' }
    });
    if (!r.ok) continue;
    const j = await r.json();
    const posts = j?.data?.children || [];
    for (const p of posts) {
      results.push({ sub, title: p.data.title, score: p.data.score, selftext: p.data.selftext?.slice(0, 200) });
    }
    await new Promise(res => setTimeout(res, 700));
  }
  return results;
}

// Pokemon Center product pages - try to find product images and prices
async function pokemonCenter(q) {
  try {
    const r = await fetch(`https://www.pokemoncenter.com/en-us/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA } });
    const html = await r.text();
    // find price patterns
    const prices = [...html.matchAll(/\$([0-9]+\.[0-9]{2})/g)].map(m => parseFloat(m[1])).filter(p => p > 5 && p < 500);
    // find product image
    const imgMatch = html.match(/https:\/\/assets\.pokemon\.com\/assets\/cms2[^"'\s]+\.jpg/);
    return { prices: prices.slice(0, 5), img: imgMatch?.[0] };
  } catch { return {}; }
}

// TCGPlayer search for market prices
async function tcgplayer(q) {
  try {
    const r = await fetch(`https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(q)}&view=grid`, { headers: { 'User-Agent': UA } });
    const html = await r.text();
    const prices = [...html.matchAll(/\$([0-9]+\.[0-9]{2})/g)].map(m => parseFloat(m[1])).filter(p => p > 5 && p < 1000);
    return prices.slice(0, 8);
  } catch { return []; }
}

const products = [
  'Prismatic Evolutions Elite Trainer Box',
  'Prismatic Evolutions Super Premium Collection',
  'Chaos Rising Elite Trainer Box',
  'Chaos Rising Booster Bundle',
  'Pitch Black Booster Bundle',
  'Pitch Black Elite Trainer Box',
];

for (const product of products) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PRODUCT: ${product}`);

  const [pc, tcp, reddit] = await Promise.all([
    pokemonCenter(product),
    tcgplayer(product),
    redditSearch(product),
  ]);

  if (pc.prices?.length) console.log('Pokemon Center prices:', pc.prices);
  if (pc.img) console.log('Image:', pc.img);
  if (tcp.length) console.log('TCGPlayer prices:', tcp);
  if (reddit.length) {
    console.log('Reddit:');
    reddit.slice(0, 3).forEach(p => console.log(`  [r/${p.sub}] ${p.title} (${p.score}pts)`));
  }
}
