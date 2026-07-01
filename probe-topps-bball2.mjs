import { execFile } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function curl(url) {
  const { stdout } = await exec('curl', ['-sL', '--max-time', '25', '--connect-timeout', '12', '-A', UA, '--compressed', '-H', 'Accept: text/html', url]);
  return stdout;
}

// Try Topps product page directly
const html = await curl('https://www.topps.com/pages/topps-chrome-updates-basketball');
const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
console.log('STATUS CHECK (first 200):', text.slice(0, 200));

// Extract prices
const prices = html.match(/\$[\d,]+\.?\d{0,2}/g);
console.log('Prices:', [...new Set(prices || [])]);

// Extract dropDate entries
const drops = [...html.matchAll(/"dropDate":"([^"]+)"/g)].map(m => m[1]);
console.log('dropDates:', drops);

// Look for product data blocks
const productData = [...html.matchAll(/"products?":\s*(\[[\s\S]{0,2000}?\])/g)].map(m => m[1]);
console.log('Product data blocks:', productData.slice(0, 2).map(b => b.slice(0, 400)));

// Look for price fields
const priceFields = [...html.matchAll(/"price[^"]*":\s*"?(\$?[\d.]+)"?/gi)].map(m => m[0]);
console.log('Price fields:', priceFields.slice(0, 10));

// Full text
console.log('\nFull text (3000):', text.slice(0, 3000));
