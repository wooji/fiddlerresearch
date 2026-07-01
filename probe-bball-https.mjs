import { execFile } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execFile);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function curl(url) {
  try {
    const { stdout } = await exec('curl', ['-sL', '--max-time', '20', '--connect-timeout', '10', '-A', UA, '--compressed', '-H', 'Accept: text/html,application/xhtml+xml', url]);
    return stdout;
  } catch(e) { return ''; }
}

// Try multiple sources
const sources = [
  ['GameStop', 'https://www.gamestop.com/search#q=topps+chrome+updates+basketball+2025+hobby+box&prefn1=SKUGender&prefv1=all'],
  ['Target', 'https://www.target.com/s?searchTerm=2025-26+topps+chrome+updates+basketball+hobby+box'],
  ['SCCollectibles', 'https://www.steelcitycollectibles.com/search?type=product&q=topps+chrome+updates+basketball+2025+hobby'],
  ['BlowoutForums search', 'https://www.blowoutforums.com/search.php?keywords=topps+chrome+updates+basketball+2025&fid%5B%5D=21'],
  ['eBay', 'https://www.ebay.com/sch/i.html?_nkw=2025-26+Topps+Chrome+Updates+Basketball+Hobby+Box&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=20'],
  ['Cardboard Connection', 'https://www.cardboardconnection.com/?s=topps+chrome+updates+basketball+2025'],
];

for (const [name, url] of sources) {
  console.log(`\n=== ${name} ===`);
  const html = await curl(url);
  if (!html) { console.log('EMPTY/BLOCKED'); continue; }
  // Extract text
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // Look for prices
  const prices = text.match(/\$[\d,]+\.?\d{0,2}/g);
  const dateHints = text.match(/\b(july|august|september|2025|2026|release|drop|available)\b[^.]{0,80}/gi);
  console.log('Prices:', prices ? [...new Set(prices)].slice(0, 10) : 'none');
  console.log('Date hints:', dateHints ? dateHints.slice(0, 5) : 'none');
  console.log('Text snippet:', text.slice(0, 800));
}
