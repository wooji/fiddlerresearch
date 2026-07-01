import { execFileSync } from 'child_process';

const products = [
  ['pe-spc',          'https://www.pricecharting.com/game/pokemon-prismatic-evolutions/super-premium-collection-box'],
  ['charizard-spc',   'https://www.pricecharting.com/game/pokemon-promo/charizard-ex-super-premium-collection-box'],
  ['celebrations-spc','https://www.pricecharting.com/game/pokemon-celebrations/pikachu-vmax-premium-collection'],
  ['shining-fates-spc','https://www.pricecharting.com/game/pokemon-shining-fates/shining-fates-premium-collection-shiny-charizard-v'],
  ['crown-zenith-spc','https://www.pricecharting.com/game/pokemon-crown-zenith/crown-zenith-premium-collection'],
  ['of-spc',          'https://www.pricecharting.com/game/pokemon-obsidian-flames/obsidian-flames-super-premium-collection-box'],
  ['pf-spc',          'https://www.pricecharting.com/game/pokemon-paldean-fates/paldean-fates-super-premium-collection-box'],
  ['151-spc',         'https://www.pricecharting.com/game/pokemon-151/151-super-premium-collection-box'],
  ['paradox-spc',     'https://www.pricecharting.com/game/pokemon-paradox-rift/paradox-rift-super-premium-collection-box'],
];

const priceRx = (id) => new RegExp(`id="${id}"[\\s\\S]{0,500}`);

for (const [label, url] of products) {
  try {
    const r = execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0', url], { encoding: 'utf8' });
    const usedBlock = r.match(/id="used_price"[\s\S]{0,400}/)?.[0];
    const used = usedBlock?.match(/\$([0-9,.]+)/)?.[1];
    // chart_data first + last price
    const cdRaw = r.match(/chart_data\s*=\s*(\[\[[\s\S]{0,2000}?\]\])/)?.[1];
    let firstPrice = null, lastPrice = null;
    if (cdRaw) {
      try {
        const cd = JSON.parse(cdRaw);
        firstPrice = cd?.[0]?.[1];
        lastPrice  = cd?.[cd.length - 1]?.[1];
      } catch {}
    }
    console.log(label, '| current:', used ?? 'n/a', '| first:', firstPrice ?? 'n/a', '| last:', lastPrice ?? 'n/a', '| pageLen:', r.length);
  } catch (e) { console.log(label, 'ERR', e.message); }
}
