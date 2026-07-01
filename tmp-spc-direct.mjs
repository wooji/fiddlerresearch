import { execFileSync } from 'child_process';

const targets = [
  ['151 UPC',         119.99, 'pokemon-scarlet-&-violet-151',    'ultra-premium-collection-box',               '2023-09'],
  ['Paradox Rift SPC', 49.99, 'pokemon-paradox-rift',            'paradox-rift-super-premium-collection-box',  '2023-11'],
  ['Obsidian Flames SPC',49.99,'pokemon-obsidian-flames',         'obsidian-flames-super-premium-collection-box','2023-08'],
  ['Paldean Fates SPC', 59.99,'pokemon-paldean-fates',           'paldean-fates-super-premium-collection-box', '2024-01'],
  ['Crown Zenith SPC',  49.99,'pokemon-sword-and-shield-crown-zenith','crown-zenith-ultra-premium-collection-box','2023-01'],
  ['Celebrations UPC',  99.99,'pokemon-celebrations',             'celebrations-ultra-premium-collection',      '2021-10'],
  ['Shining Fates SPC', 44.99,'pokemon-sword-and-shield-shining-fates','shining-fates-premium-collection',    '2021-02'],
];

for (const [label, msrp, game, prod, histFrom] of targets) {
  const url = `https://www.pricecharting.com/game/${game}/${prod}`;
  try {
    const html = execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0', url], { encoding: 'utf8' });
    const title = html.match(/<title>([^<]+)/)?.[1]?.trim();
    // Look for used_price in the id-based price box (product page) vs list page (no id)
    const usedBlock = html.match(/id="used_price"[\s\S]{0,500}/)?.[0];
    const used = usedBlock?.match(/\$([0-9,.]+)/)?.[1];
    // Also try new_price / sealed_price patterns
    const newBlock = html.match(/id="new_price"[\s\S]{0,300}/)?.[0];
    const newP = newBlock?.match(/\$([0-9,.]+)/)?.[1];
    // chart_data
    const cd = html.match(/chart_data\s*=\s*(\[\[[\s\S]{0,3000}?\]\])/)?.[1];
    let first = null, last = null;
    if (cd) { try { const arr = JSON.parse(cd); first = arr[0]?.[1]; last = arr[arr.length-1]?.[1]; } catch {} }
    const market = used ? parseFloat(used.replace(/,/g,'')) : null;
    const multNow = market ? (market / msrp).toFixed(2) : 'n/a';
    console.log(`${label} | used=$${used??'n/a'} | new=$${newP??'n/a'} | first=$${first??'n/a'} | mult=${multNow}× | title:${(title??'').slice(0,50)}`);
  } catch (e) { console.log(label, 'ERR:', e.message); }
}
