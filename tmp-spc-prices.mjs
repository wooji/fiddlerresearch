import { execFileSync } from 'child_process';

// (set, msrp, search query, histFrom date, HierRank)
const targets = [
  ['Scarlet & Violet 151',   119.99, '151 ultra premium collection box',          '2023-09', 'spc'],
  ['Paradox Rift',            49.99, 'paradox rift super premium collection box',  '2023-11', 'spc'],
  ['Obsidian Flames',         49.99, 'obsidian flames super premium collection box','2023-08', 'spc'],
  ['Paldean Fates',           59.99, 'paldean fates super premium collection box', '2024-01', 'spc'],
  ['Crown Zenith',            49.99, 'crown zenith premium collection box',         '2023-01', 'spc'],
  ['Celebrations',            99.99, 'celebrations ultra premium collection',        '2021-10', 'spc'],
  ['Shining Fates',           44.99, 'shining fates premium collection charizard',  '2021-02', 'spc'],
];

const rows = [];

for (const [setName, msrp, q, histFrom, rank] of targets) {
  const enc = encodeURIComponent(q);
  const url = 'https://www.pricecharting.com/search-products?q=' + enc + '&type=prices';
  try {
    const html = execFileSync('curl', ['-sL', '--max-time', '12', '-A', 'Mozilla/5.0', url], { encoding: 'utf8' });
    const tbIdx = html.indexOf('<tbody>');
    const slice = html.slice(tbIdx, tbIdx + 3000);

    // First used_price
    const priceMatch = slice.match(/class="[^"]*used_price[^"]*"[\s\S]{0,100}?<span[^>]*>\$([0-9,.]+)/);
    // Product name
    const nameMatch = slice.match(/class="title"[\s\S]{0,300}?<a[^>]+>([^<]{5,80})<\/a>/);

    if (priceMatch) {
      const market = parseFloat(priceMatch[1].replace(/,/g, ''));
      const multNow = (market / msrp).toFixed(2);
      const prodName = nameMatch?.[1]?.trim() ?? q;
      console.log(`${setName} | ${prodName} | market=$${market} | msrp=$${msrp} | mult=${multNow}× | histFrom=${histFrom}`);
      rows.push({ setName, prodName, msrp, market, multNow: parseFloat(multNow), histFrom, rank });
    } else {
      console.log(setName, '| NO PRICE FOUND for:', q);
    }
  } catch (e) {
    console.log(setName, 'ERR:', e.message);
  }
}

// Output CSV rows to append
console.log('\n--- CSV ROWS ---');
for (const r of rows) {
  const ath = r.market; // use current as ATH since we don't have historical ATH here
  const multATH = r.multNow;
  console.log(`${r.setName},${r.prodName} (SPC/UPC),${r.msrp},${r.market},${ath},${r.multNow},${multATH},${r.histFrom},${r.rank},Y`);
}
