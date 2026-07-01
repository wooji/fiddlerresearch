import { execFile } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
async function curl(url) {
  try { const { stdout } = await exec('curl', ['-sL','--max-time','25','--connect-timeout','12','-A',UA,'--compressed',url]); return stdout; } catch(e) { return ''; }
}

// Full transcript from the checklist/breakdown video (yvjVWUeLYnY)
try {
  await exec('python', ['-m', 'yt_dlp', '--skip-download', '--write-auto-sub', '--sub-lang', 'en', '--sub-format', 'vtt', '-o', 'yt_bball_chk.%(ext)s', 'https://www.youtube.com/watch?v=yvjVWUeLYnY'], { timeout: 30000 });
  const fs = await import('fs');
  const vtt = fs.readFileSync('yt_bball_chk.en.vtt', 'utf8');
  const lines = vtt.split('\n').filter(l => !/^\d{2}:|^WEBVTT|^Kind:|^Language:|^$/.test(l) && !l.includes('-->'));
  const deduped = [...new Set(lines)].join(' ').replace(/\s+/g,' ');
  console.log('FULL TRANSCRIPT:', deduped.slice(0, 8000));
  fs.unlinkSync('yt_bball_chk.en.vtt');
} catch(e) { console.log('YT error:', e.message.slice(0,200)); }

// Also get SCP direct product page for "2025 Topps Chrome Basketball"
console.log('\n=== SCP CHROME BASKETBALL DIRECT ===');
const scp = await curl('https://www.sportscardspro.com/2025-topps-chrome-basketball');
const text = scp.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const prices = scp.match(/\$[\d,]+\.?\d{0,2}/g);
console.log('Prices:', [...new Set(prices||[])].slice(0,10));
console.log('Text (2000):', text.slice(0,2000));

// Try SCP for Chrome Updates Basketball specifically
console.log('\n=== SCP CHROME UPDATES BBALL ===');
const scp2 = await curl('https://www.sportscardspro.com/2025-topps-chrome-updates-basketball');
const text2 = scp2.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
console.log('Response (500):', text2.slice(0,500));
