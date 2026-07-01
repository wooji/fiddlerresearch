import { execFile } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
async function curl(url) {
  try { const { stdout } = await exec('curl', ['-sL','--max-time','25','--connect-timeout','12','-A',UA,'--compressed',url]); return stdout; } catch(e) { return ''; }
}

// 1. Get SCP page for Chrome Updates Basketball hobby box specifically
console.log('=== SCP DIRECT PAGE ===');
const scp = await curl('https://www.sportscardspro.com/search-products?type=prices&q=2025-26+topps+chrome+updates+basketball+hobby+box');
// Parse table rows
const rows = [...scp.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).filter(r => r.length > 5 && r.length < 300);
console.log('Table rows:', rows.slice(0, 30));
// Also look for the specific product price
const usedPrice = [...scp.matchAll(/js-price[^>]*>([^<]+)</gi)].map(m => m[1].trim());
console.log('Prices (js-price):', usedPrice.slice(0, 20));

// 2. Also get SCP page for base "2025-26 topps chrome basketball hobby box" for comparison
console.log('\n=== SCP BASE CHROME ===');
const scp2 = await curl('https://www.sportscardspro.com/search-products?type=prices&q=2025-26+topps+chrome+basketball+hobby+box');
const usedPrice2 = [...scp2.matchAll(/js-price[^>]*>([^<]+)</gi)].map(m => m[1].trim());
const rows2 = [...scp2.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).filter(r => r.length > 5 && r.length < 300);
console.log('Base chrome prices:', usedPrice2.slice(0, 5));
console.log('Base chrome rows:', rows2.slice(0, 15));

// 3. YT transcript for breakdown video
console.log('\n=== YT TRANSCRIPT (breakdown) ===');
try {
  await exec('python', ['-m', 'yt_dlp', '--skip-download', '--write-auto-sub', '--sub-lang', 'en', '--sub-format', 'vtt', '-o', 'yt_bball.%(ext)s', 'https://www.youtube.com/watch?v=yvjVWUeLYnY'], { timeout: 30000 });
  const fs = await import('fs');
  const vtt = fs.readFileSync('yt_bball.en.vtt', 'utf8');
  // Strip VTT formatting
  const lines = vtt.split('\n').filter(l => !/^\d{2}:|^WEBVTT|^Kind:|^Language:|^$/.test(l) && !l.includes('-->'));
  const deduped = [...new Set(lines)].join(' ').replace(/\s+/g,' ');
  console.log('Transcript:', deduped.slice(0, 3000));
  fs.unlinkSync('yt_bball.en.vtt');
} catch(e) { console.log('YT error:', e.message.slice(0,200)); }
