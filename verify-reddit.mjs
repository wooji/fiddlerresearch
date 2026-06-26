const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Test Blowout Forums
console.log('--- Blowout Forums ---');
const url = `https://www.blowoutforums.com/showresults.php?ps=1&q=${encodeURIComponent('lorcana wilds unknown')}`;
try {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
  console.log('Status:', r.status);
  const h = await r.text();
  console.log('Length:', h.length, 'First 400:', h.slice(0, 400));
  const allLinks = [...h.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{10,100})<\/a>/g)].map(m => m[2].trim()).filter(Boolean);
  console.log('Links/titles found:', allLinks.slice(0, 10));
} catch(e) { console.log('Error:', e.message); }

// Test YouTube via yt-dlp
console.log('\n--- YouTube yt-dlp ---');
const { exec } = await import('child_process');
const { promisify } = await import('util');
try {
  const { stdout, stderr } = await promisify(exec)(
    `python -m yt_dlp "ytsearch5:lorcana wilds unknown box break" --print "%(id)s|%(duration)s|%(title)s" --no-playlist --no-download --quiet`,
    { timeout: 25000, windowsHide: true }
  );
  console.log('yt-dlp stdout:', stdout.trim().slice(0, 500));
  if (stderr) console.log('yt-dlp stderr:', stderr.slice(0, 200));
} catch(e) { console.log('yt-dlp error:', e.message.slice(0, 200)); }
