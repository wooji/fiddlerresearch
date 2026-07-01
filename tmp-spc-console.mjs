/**
 * Browse PriceCharting set/console pages to find sealed UPC/SPC product URLs
 */
import { execFileSync } from 'child_process';

const consoles = [
  ['Generations',          'pokemon-generations'],
  ['Shining Legends',      'pokemon-shining-legends'],
  ['Dragon Majesty',       'pokemon-dragon-majesty'],
  ['Charizard ex SPC',     'pokemon-promo'],
  ['Hidden Fates',         'pokemon-hidden-fates'],
  ['Sword Shield Base',    'pokemon-sword-and-shield'],
  ['Celebrations',         'pokemon-celebrations'],
  ['Arceus VSTAR',         'pokemon-astral-radiance'],
  ['151',                  'pokemon-scarlet-&-violet-151'],
  ['Terapagos ex',         'pokemon-twilight-masquerade'],
  ['Mega Charizard X ex',  'pokemon-shrouded-fable'],
  ['Team Rocket Moltres',  'pokemon-destined-rivals'],
  ['30th Celebration',     'pokemon-surging-sparks'],
];

for (const [label, slug] of consoles) {
  const url = `https://www.pricecharting.com/console/${slug}`;
  try {
    const html = execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0', url], { encoding: 'utf8' });
    // Find all sealed/premium/collection product links
    const links = [...html.matchAll(/href="(\/game\/[^"]+)"[^>]*>\s*([^<]{5,80})<\/a>/g)]
      .map(m => ({ href: m[1], name: m[2].trim() }))
      .filter(x => /premium|ultra|super|collection|upc|spc/i.test(x.name));
    if (links.length) {
      links.slice(0, 5).forEach(l => console.log(`${label} | ${l.name} | ${l.href}`));
    } else {
      console.log(`${label} | no premium links on: ${url}`);
    }
  } catch (e) {
    console.log(`${label} ERR: ${e.message.slice(0, 60)}`);
  }
}
