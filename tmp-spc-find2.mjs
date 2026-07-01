import { execFileSync } from 'child_process';

// Check what rows are on the OF page - look for any box/collection
const html = execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0',
  'https://www.pricecharting.com/game/pokemon-obsidian-flames/obsidian-flames-super-premium-collection-box'
], { encoding: 'utf8' });

const tbIdx = html.indexOf('<tbody>');
const slice = html.slice(tbIdx, tbIdx + 10000);

// Extract all name + price pairs
const rows = [...slice.matchAll(/<td class="title"[\s\S]{0,500}?<a[^>]+>([^<]+)<\/a>[\s\S]{0,200}?<span class="js-price">\$([0-9,.]+)/g)];
rows.slice(0, 20).forEach(m => console.log(m[1].trim(), '|', m[2]));
