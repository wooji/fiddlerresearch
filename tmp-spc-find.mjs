import { execFileSync } from 'child_process';

// These searches should find the sealed SPC product in the list results
const targets = [
  ['Paradox Rift SPC',    49.99, 'pokemon-paradox-rift',           'paradox-rift-super-premium-collection-box',  '2023-11'],
  ['Obsidian Flames SPC', 49.99, 'pokemon-obsidian-flames',        'obsidian-flames-super-premium-collection-box','2023-08'],
  ['Paldean Fates SPC',   59.99, 'pokemon-paldean-fates',          'paldean-fates-super-premium-collection-box', '2024-01'],
  ['Crown Zenith UPC',    49.99, 'pokemon-sword-and-shield-crown-zenith', 'crown-zenith-ultra-premium-collection-box', '2023-01'],
  ['Celebrations UPC',    99.99, 'pokemon-celebrations',           'celebrations-ultra-premium-collection',      '2021-10'],
];

for (const [label, msrp, game, prod, histFrom] of targets) {
  const url = `https://www.pricecharting.com/game/${game}/${prod}`;
  const html = execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0', url], { encoding: 'utf8' });

  const tbIdx = html.indexOf('<tbody>');
  const slice = html.slice(tbIdx, tbIdx + 50000);

  // Find rows that contain 'collection' or 'box' or 'premium' in the title
  const rowMatches = [...slice.matchAll(/<tr[^>]+>[\s\S]{0,2000}?<\/tr>/g)];

  for (const row of rowMatches) {
    const text = row[0];
    const href = text.match(/href="(\/game\/[^"]+)"/)?.[1];
    const name = text.match(/onclick[^>]+>\s*([^<]{5,80})<\/a>/)?.[1]?.trim();
    const price = text.match(/class="js-price">\$([0-9,.]+)/)?.[1];

    if (/collection|super.premium|ultra.premium/i.test(name ?? '') && price) {
      const market = parseFloat(price.replace(/,/g, ''));
      const mult = (market / msrp).toFixed(2);
      console.log(`${label} | ${name} | $${price} | ${mult}× retail | ${href}`);
      break;
    }
  }
}
