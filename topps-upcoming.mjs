// Scrape upcoming Topps (+ other) card releases for the next N days.
// Topps' own launches.topps.com (EQL) is Kasada bot-protected; its page-data is
// stale. So we scrape public release calendars (checklistinsider, cardboardconnection),
// regex out product + date, filter to the window, and post to the Fiddler webhook.
// Usage: node topps-upcoming.mjs [days=7] [--post]
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const DAYS = parseInt(process.argv[2] ?? '7', 10) || 7;
const POST = process.argv.includes('--post');
const NOW  = Date.parse('2026-06-20T00:00:00');           // session date; replace w/ Date.now() in prod
const HORIZON = NOW + DAYS * 864e5;
const WEBHOOK = (() => { try { return Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })).EXTERNAL_WEBHOOK_URL; } catch { return null; } })();

const SOURCES = [
  { name: 'checklistinsider', url: 'https://www.checklistinsider.com/release-calendar' },
  { name: 'checklistinsider-baseball', url: 'https://www.checklistinsider.com/2026-baseball-cards' },
  { name: 'cardboardconnection', url: 'https://www.cardboardconnection.com/' },
];

const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
// Parse a date near a product line → epoch ms (assume current/ next year window).
function parseDate(txt) {
  let m = txt.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?/i);
  if (m) { const y = m[3] ? +m[3] : 2026; return Date.UTC(y, MONTHS[m[1].toLowerCase().slice(0,3)], +m[2]); }
  m = txt.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) { let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : 2026; return Date.UTC(y, +m[1]-1, +m[2]); }
  return null;
}

const results = [];
const browser = await chromium.launch({ headless: true });
for (const src of SOURCES) {
  const page = await browser.newContext().then(c => c.newPage());
  try {
    const r = await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null);
    if (!r || r.status() >= 400) { console.error(`  [${src.name}] status ${r?.status()} — skip`); continue; }
    await page.waitForTimeout(1200);
    // grab candidate rows: any element text naming a card product + a date
    const rows = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('tr, li, .release, .calendar-item, article, .post, h2, h3').forEach(el => {
        const t = el.innerText?.replace(/\s+/g, ' ').trim();
        if (t && t.length < 120 && /\b(topps|bowman|chrome|finest|stadium club|gypsy queen|allen|cosmic)\b/i.test(t)) out.push(t);
      });
      return [...new Set(out)];
    });
    for (const t of rows) {
      const d = parseDate(t);
      if (d && d >= NOW && d <= HORIZON) results.push({ src: src.name, date: d, text: t });
    }
    console.error(`  [${src.name}] ${rows.length} card rows, ${results.length} in-window so far`);
  } catch (e) { console.error(`  [${src.name}] err ${e.message}`); }
  finally { await page.close().catch(() => {}); }
}
await browser.close();

// dedupe + sort
const seen = new Set();
const upcoming = results.filter(r => { const k = r.text.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
  .sort((a, b) => a.date - b.date);

const fmt = d => new Date(d).toISOString().slice(0, 10);
console.log(`\nUpcoming Topps/card releases next ${DAYS} days: ${upcoming.length}`);
upcoming.forEach(u => console.log(`${fmt(u.date)} | ${u.text}  [${u.src}]`));

if (POST && WEBHOOK) {
  const body = upcoming.length
    ? upcoming.map(u => `• **${fmt(u.date)}** — ${u.text}`).join('\n').slice(0, 1900)
    : '_No dated Topps releases found in window (Topps EQL feed is bot-gated; check launches.topps.com manually)._';
  await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: `📅 **Topps — next ${DAYS} days**\n${body}` }) }).catch(() => {});
  console.log('\nposted to webhook');
}
