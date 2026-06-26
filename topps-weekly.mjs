#!/usr/bin/env node
// Topps weekly "RELEASING THIS WEEK" calendar → draft a product per item into
// dynamic-products.json, then (per product) run the FULL pipeline + evidence gate.
//
// The evidence gate is intentional: parsing the tweet gives config+price only. Each
// product still REQUIRES deep research (read #card-flips 722968137687105596, pull the
// prior-year price curve sportscardspro/PriceCharting) to fill `evidence`(>=3) + scenarios
// before fiddler-research will post. No lazy auto-post — that's what burned us on Chrome BB.
//
// Usage:
//   node topps-weekly.mjs --text-file=tweet.txt     parse pasted calendar text
//   node topps-weekly.mjs --tweet=<id>              pull the tweet via X (X_AUTH_TOKEN)
//   (then for each key printed: do deep research, fill evidence+scenarios, run fiddler-research)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DYN  = join(ROOT, 'dynamic-products.json');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));

const slug = s => s.toLowerCase().replace(/®|™|:/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

// ── get the calendar text ────────────────────────────────────────────────────────
async function getText() {
  if (args['text-file']) return readFileSync(args['text-file'], 'utf8');
  if (args.tweet) {
    const env = Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/['"\r]/g, '')]; }));
    const r = await fetch(`https://api.twitter.com/2/tweets/${args.tweet}?tweet.fields=text`, { headers: { Authorization: `Bearer ${env.X_BEARER || ''}`, Cookie: `auth_token=${env.X_AUTH_TOKEN}` } });
    const j = await r.json(); return j?.data?.text ?? '';
  }
  // stdin fallback
  return readFileSync(0, 'utf8');
}

// ── parse product blocks ─────────────────────────────────────────────────────────
// A block = a title line, then lines until the next title. We detect the price line
// "Hobby Box: $X" + config ("N packs per box, M cards per pack" / "K autograph...").
function parse(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = [];
  let cur = null;
  for (const l of lines) {
    if (/RELEASING THIS WEEK/i.test(l)) continue;
    const price = l.match(/Hobby Box:\s*\$?([\d,.]+)/i);
    const cfg   = l.match(/(\d+)\s*packs?\s*per box,\s*(\d+)\s*cards?\s*per pack/i);
    const autos = l.match(/(\d+)\s*autograph/i);
    const day   = l.match(/\b(Mon|Tue|Tues|Wed|Thur|Thurs|Fri|Sat|Sun)\b.*?(\d{1,2}\/\d{1,2}).*?(\d{1,2}\s*(?:AM|PM))/i);
    // title = a line with a year + a product word, no price/config tokens
    const isTitle = /(20\d\d|20\d\d-\d\d)/.test(l) && !price && !cfg && !autos && !/per box/i.test(l) && l.length < 80;
    if (isTitle) { if (cur) out.push(cur); cur = { title: l.replace(/[⚾️🏀⚽️💎👊1️⃣🇦🇺\s]*$/u, '').trim(), eql: false }; continue; }
    if (!cur) continue;
    if (price) cur.retail = +price[1].replace(/,/g, '');
    if (cfg)   { cur.packsPerBox = +cfg[1]; cur.cardsPerPack = +cfg[2]; }
    if (autos) cur.autosPerBox = +autos[1];
    if (day)   { cur.day = day[2]; cur.time = day[3]; }
    if (/EQL/i.test(l)) cur.eql = true;
  }
  if (cur) out.push(cur);
  return out.filter(p => p.title && p.retail);
}

// ── draft a fiddler product (config only — research fields left for the gate) ──────
function draft(p) {
  const key = slug(p.title);
  return [key, {
    label:       p.title,
    category:    'topps',
    set:         /chrome/i.test(p.title) ? 'Topps Chrome' : 'Topps',
    retail:      p.retail,
    retailNote:  `Hobby preorder $${p.retail}${p.day ? ` · ${p.day} ${p.time || ''}` : ''}${p.eql ? ' · EQL' : ''} (from weekly Topps calendar)`,
    releaseUrl:  'https://www.topps.com/release-calendar',
    tcgId: null, supplyScore: 10, liveMarket: null, preRelease: true, forceRating: 'ORANGE',
    ebayQuery:   p.title.replace(/®|™/g, ''),
    images: [],
    boxConfig:   { cardsPerBox: (p.packsPerBox || 1) * (p.cardsPerPack || 0), autosPerBox: p.autosPerBox || 0 },
    releaseDate: `Preorder ${p.day || 'this week'} ${p.time || ''}`.trim(),
    sellThrough: { flip: { range: 'TBD — research', units: '' }, hold: { range: 'TBD', units: '' }, invest: { range: 'TBD', units: '' } },
    bulkBuy: 'TBD', risk: 'High', ebayFee: 0.13,
    // evidence[] + scenarios MUST be filled by deep research before the gate allows posting:
    evidence: [{ source: 'Topps weekly calendar tweet', date: new Date().toISOString().slice(0, 10), point: `${p.title} hobby $${p.retail} · ${p.packsPerBox || '?'}pk×${p.cardsPerPack || '?'} · ${p.autosPerBox || 0} auto/box` }],
    writeup: { market: '• PENDING deep research (intel channels + prior-year price curve).', product: `• **Config:** ${(p.packsPerBox||'?')} packs × ${(p.cardsPerPack||'?')} = ${(p.packsPerBox||1)*(p.cardsPerPack||0)} cards/box · ${p.autosPerBox||0} auto/box.`, priceComp: '', supplyDemand: '', recs: '• PENDING.' },
  }];
}

const text = await getText();
const items = parse(text);
if (!items.length) { console.error('No products parsed. Check input format.'); process.exit(1); }

const dyn = existsSync(DYN) ? JSON.parse(readFileSync(DYN, 'utf8')) : {};
const keys = [];
for (const p of items) { const [k, obj] = draft(p); dyn[k] = obj; keys.push(k); }
writeFileSync(DYN, JSON.stringify(dyn, null, 2) + '\n');

console.log(`Drafted ${keys.length} Topps products → dynamic-products.json:`);
items.forEach((p, i) => console.log(`  ${keys[i].padEnd(42)} $${p.retail}  ${p.day || ''} ${p.eql ? '(EQL)' : ''}`));
console.log(`\nNEXT (per product — REQUIRED, the evidence gate blocks posting without it):`);
console.log(`  1. Read #card-flips (722968137687105596) for intel on each.`);
console.log(`  2. Pull the prior-year price curve (sportscardspro/PriceCharting 30/90/180d).`);
console.log(`  3. Fill evidence(>=3) + scenarios + writeup in dynamic-products.json.`);
console.log(`  4. node fiddler-research.mjs <key>   (posts after the gate passes)`);
console.log(`\nKeys: ${keys.join(' ')}`);
