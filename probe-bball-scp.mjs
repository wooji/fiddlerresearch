import { execFile } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function curl(url) {
  try {
    const { stdout } = await exec('curl', ['-sL', '--max-time', '25', '--connect-timeout', '12', '-A', UA, '--compressed', url]);
    return stdout;
  } catch(e) { return ''; }
}

// 1. SportsCardsPro
console.log('=== SPORTSCARDSPRO ===');
const scp = await curl('https://www.sportscardspro.com/search-products?type=prices&q=2025-26+topps+chrome+updates+basketball+hobby+box');
if (scp && !scp.includes('moment')) {
  const text = scp.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const prices = scp.match(/\$[\d,]+\.?\d{0,2}/g);
  console.log('Prices:', [...new Set(prices || [])]);
  console.log('Text:', text.slice(0, 1000));
} else {
  console.log('BLOCKED or empty');
}

// 2. Try StockX product search
console.log('\n=== STOCKX ===');
const stxSearch = await curl('https://stockx.com/search?s=2025-26+topps+chrome+updates+basketball+hobby+box');
if (stxSearch && !stxSearch.includes('Cloudflare')) {
  const text = stxSearch.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log('STX text:', text.slice(0, 1000));
} else {
  console.log('BLOCKED');
}

// 3. yt-dlp search for break videos
console.log('\n=== YOUTUBE BREAKS ===');
try {
  const { stdout: ytOut } = await exec('python', ['-m', 'yt_dlp', 'ytsearch8:2025-26 Topps Chrome Updates Basketball hobby box break', '--print', '%(id)s|%(duration)s|%(title)s', '--no-playlist', '--no-download'], { timeout: 30000 });
  console.log(ytOut);
} catch(e) {
  console.log('yt-dlp error:', e.message.slice(0, 200));
}

// 4. Try cardboardconnection.com via different path
console.log('\n=== CARDBOARD CONNECTION ===');
const cc = await curl('https://www.cardboardconnection.com/2025-26-topps-chrome-update-basketball');
if (cc && cc.length > 500 && !cc.includes('Page not found')) {
  const text = cc.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  const prices = cc.match(/\$[\d,]+\.?\d{0,2}/g);
  console.log('Prices:', [...new Set(prices||[])]);
  console.log('Text:', text.slice(0, 2000));
} else {
  console.log('Not found or empty');
}
