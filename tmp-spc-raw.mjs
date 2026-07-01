import { execFileSync } from 'child_process';

const html = execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0',
  'https://www.pricecharting.com/game/pokemon-obsidian-flames/obsidian-flames-super-premium-collection-box'
], { encoding: 'utf8' });

const tbIdx = html.indexOf('<tbody>');
// Just dump first 3000 chars of tbody
console.log(html.slice(tbIdx, tbIdx + 3000));
