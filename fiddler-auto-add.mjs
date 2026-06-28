/**
 * fiddler-auto-add.mjs
 *
 * Zero-session auto-research script. Gathers all intel autonomously,
 * generates a product entry, appends to dynamic-products.json,
 * then runs fiddler-research.mjs to post the embed.
 *
 * Usage:
 *   node fiddler-auto-add.mjs "2025-26 Topps Inception Basketball"
 *   node fiddler-auto-add.mjs "Pokemon Destined Rivals ETB" --retail 69.99
 *   node fiddler-auto-add.mjs "OP-15 One Piece" --category onepiece
 *
 * Flags:
 *   --retail <price>       Override MSRP (skip auto-detect)
 *   --category <cat>       Force category: pokemon|topps|mtg|onepiece|lego|lorcana|other
 *   --key <key>            Force product key (default: slugified name)
 *   --no-post              Build entry but don't run fiddler-research.mjs
 *   --dry-run              Print entry, don't write or post
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env ──────────────────────────────────────────────────────────────
const envRaw = readFileSync(join(__dir, '.env'), 'utf8');
const ENV = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2].trim();
}

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const productName = args.find(a => !a.startsWith('--')) ?? '';
if (!productName) { console.error('Usage: node fiddler-auto-add.mjs "Product Name"'); process.exit(1); }

const flagVal = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (flag) => args.includes(flag);

const forceCategory = flagVal('--category');
const forceKey      = flagVal('--key');
const forceRetail   = flagVal('--retail') ? parseFloat(flagVal('--retail')) : null;
const noPost        = hasFlag('--no-post');
const dryRun        = hasFlag('--dry-run');

// ── DB paths ────────────────────────────────────────────────────────────────
const DB_PATHS = {
  pokemon:  join(__dir, 'set-history.json'),
  mtg:      join(__dir, 'set-history-mtg.json'),
  onepiece: join(__dir, 'set-history-one-piece.json'),
  lego:     join(__dir, 'set-history-lego.json'),
  lorcana:  join(__dir, 'set-history-lorcana.json'),
  sports:   join(__dir, 'set-history-sports.json'),
  other:    join(__dir, 'set-history-other-tcg.json'),
  noncard:  join(__dir, 'set-history-noncard.json'),
};
const DYNAMIC_PATH = join(__dir, 'dynamic-products.json');

// ── Category detection ─────────────────────────────────────────────────────
function detectCategory(name) {
  if (forceCategory) return forceCategory;
  const n = name.toLowerCase();
  if (/pokemon|pikachu|charizard|eevee|scarlet|violet|paldea|destined|twilight|stellar|paradise|surging|stellar|obsidian|paradox|temporal|paldean|crown zenith|lost origin|silver tempest|brilliant|fusion|chilling|evolving|vivid|battle styles|shining|champion|darkness ablaze|sword shield|rebel|cosmic eclipse|unified|sun moon|burning shadows|guardians|evolutions|breakthrough|breakpoint|ancient origins|roaring skies|primal clash|phantom|flashfire|fates collide|steam siege|breakpoint|ancient origins/i.test(n)) return 'pokemon';
  if (/lorcana|inklands|floodborn|first chapter|shimmering skies|azurite|ursula|archazi/i.test(n)) return 'lorcana';
  if (/one piece|op-\d+|op\d+|romance dawn|paramount war|pillars of strength|kingdoms|awakening|twin champions|wings of captain|500 years|memorial collection|two legends|ultra deck/i.test(n)) return 'onepiece';
  if (/lego|set \d{5}/i.test(n)) return 'lego';
  if (/magic|mtg|secret lair|commander|booster|draft|collector|play booster|set booster|horizons|ravnica|innistrad|dominaria|strixhaven|kaldheim|zendikar|eldraine|ikoria|theros|ixalan|lorwyn|alara|mirrodin|scars|zendikar|worldwake|rise|eldrazi|original|revised|unlimited|fourth|fifth|sixth|seventh|eighth|ninth|tenth/i.test(n)) return 'mtg';
  // Panini = sports (no longer licensed but still has legacy products), Topps/Bowman = topps
  if (/panini|prizm|national treasures|flawless|immaculate|select|hoops|contenders|chronicles|optic|donruss|score|prestige/i.test(n)) return 'sports';
  if (/topps|bowman|inception|chrome|finest|platinum|heritage|stadium club|archives|allen ginter|gypsy queen|series 1|series 2|update|motif|midnight|cactus jack|disney chrome/i.test(n)) return 'topps';
  if (/dragon ball|digimon|cardfight|vanguard|weiss|naruto|union arena|flesh.*blood|grand archive/i.test(n)) return 'other';
  if (/vinyl|funko|lego|sneaker|jordan|yeezy|labubu|pop mart|squishmallow/i.test(n)) return 'noncard';
  return 'other';
}

// ── Sport detection (for Topps) ────────────────────────────────────────────
function detectSport(name) {
  const n = name.toLowerCase();
  if (/basketball|nba|hoops/i.test(n)) return 'basketball';
  if (/football|nfl/i.test(n)) return 'football';
  if (/baseball|mlb/i.test(n)) return 'baseball';
  if (/soccer|ufc|wrestling|hockey|nhl/i.test(n)) return 'other';
  return 'baseball'; // default Topps
}

// ── Key slugifier ─────────────────────────────────────────────────────────
function slugify(name) {
  return name.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ── DB lookup: check if product already exists ─────────────────────────────
function findInDB(category, name) {
  const path = DB_PATHS[category] ?? DB_PATHS.other;
  if (!existsSync(path)) return null;
  try {
    const db = JSON.parse(readFileSync(path, 'utf8'));
    const sets = db.sets ?? db;
    const nl = name.toLowerCase();
    for (const [key, entry] of Object.entries(sets)) {
      const entryName = (entry.name ?? entry.label ?? key).toLowerCase();
      if (nl.includes(entryName) || entryName.includes(nl.split(' ').slice(0, 3).join(' '))) {
        return { key, entry };
      }
    }
  } catch { }
  return null;
}

// ── Dynamic products lookup ────────────────────────────────────────────────
function findInDynamic(name) {
  if (!existsSync(DYNAMIC_PATH)) return null;
  try {
    const dp = JSON.parse(readFileSync(DYNAMIC_PATH, 'utf8'));
    const nl = name.toLowerCase();
    for (const [key, entry] of Object.entries(dp)) {
      const label = (entry.label ?? key).toLowerCase();
      if (nl.includes(label.split(' ').slice(0, 4).join(' ')) || label.includes(nl.split(' ').slice(0, 4).join(' '))) {
        return key;
      }
    }
  } catch { }
  return null;
}

// ── Web search (Bing DDG) ──────────────────────────────────────────────────
async function webSearch(query) {
  const urls = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: AbortSignal.timeout(8000) });
      const html = await r.text();
      // Extract text snippets
      const snippets = [];
      const rx = /<[^>]+class="[^"]*(?:snippet|result|b_caption|description)[^"]*"[^>]*>([^<]{20,400})</gi;
      let m;
      while ((m = rx.exec(html)) !== null && snippets.length < 8) {
        snippets.push(m[1].replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
      }
      if (snippets.length > 0) return snippets.join('\n');
    } catch { }
  }
  return '';
}

// ── Fetch page text ────────────────────────────────────────────────────────
async function fetchText(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: AbortSignal.timeout(10000) });
    const html = await r.text();
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
  } catch { return ''; }
}

// ── YouTube break intel ────────────────────────────────────────────────────
async function youtubeBreakIntel(productName) {
  try {
    const searchQuery = `${productName} hobby box break`;
    const { stdout } = await new Promise((res, rej) => {
      const p = spawn('python', ['-m', 'yt_dlp', `ytsearch5:${searchQuery}`, '--print', '%(id)s|%(duration)s|%(title)s', '--no-playlist'], { cwd: __dir });
      let out = '';
      p.stdout.on('data', d => out += d);
      p.on('close', () => res({ stdout: out }));
      p.on('error', rej);
      setTimeout(() => { p.kill(); res({ stdout: out }); }, 15000);
    });

    const lines = stdout.trim().split('\n').filter(Boolean);
    if (!lines.length) return null;

    // Pick best match: prefer recent + relevant
    const best = lines.find(l => l.toLowerCase().includes('break') || l.toLowerCase().includes('review')) ?? lines[0];
    const videoId = best.split('|')[0];
    if (!videoId) return null;

    // Pull VTT
    const vttFile = join(__dir, `_tmp_yt_${videoId}.vtt`);
    await new Promise(res => {
      const p = spawn('python', ['-m', 'yt_dlp', '--skip-download', '--write-auto-sub', '--sub-lang', 'en', '--sub-format', 'vtt', '-o', join(__dir, `_tmp_yt_${videoId}.%(ext)s`), `https://www.youtube.com/watch?v=${videoId}`], { cwd: __dir });
      p.on('close', res);
      p.on('error', res);
      setTimeout(() => { p.kill(); res(); }, 20000);
    });

    if (!existsSync(vttFile)) return `Video: ${best.split('|')[2] ?? videoId}`;

    // Strip VTT
    const vtt = readFileSync(vttFile, 'utf8');
    const seen = new Set(); const out = [];
    for (const line of vtt.split('\n')) {
      const c = line.trim().replace(/<[^>]+>/g, '').replace(/&gt;/g, '').trim();
      if (!c || /^\d{2}:\d{2}|^WEBVTT|^align:|^Kind:/.test(c) || seen.has(c)) continue;
      seen.add(c); out.push(c);
    }

    // Clean up
    try { require('fs').unlinkSync(vttFile); } catch { }

    const transcript = out.join(' ').slice(0, 2000);
    return { videoTitle: best.split('|')[2] ?? videoId, transcript };
  } catch { return null; }
}

// ── Discord intel ──────────────────────────────────────────────────────────
async function discordIntel(query) {
  const _bt = ENV.DISCORD_BOT_TOKEN;
  const token = _bt ? `Bot ${_bt}` : null;
  if (!token) return '';
  const channels = ['722968137687105596', '1348649989781585991', '1247959380704366753'];
  const kw = query.toLowerCase().split(' ').filter(w => w.length > 3).slice(0, 4);
  const hits = [];
  for (const ch of channels) {
    try {
      const r = await fetch(`https://discord.com/api/v10/channels/${ch}/messages?limit=100`, { headers: { Authorization: token } });
      const msgs = await r.json();
      if (!Array.isArray(msgs)) continue;
      for (const m of msgs) {
        if (kw.some(k => m.content.toLowerCase().includes(k))) {
          hits.push(m.content.slice(0, 400));
        }
      }
    } catch { }
  }
  return hits.slice(0, 3).join('\n---\n');
}

// ── eBay sold comps ────────────────────────────────────────────────────────
async function ebaySoldComps(query) {
  try {
    const { ebaySold } = await import('./lib/deep-research.mjs');
    return await ebaySold(query, { limit: 20 });
  } catch { return null; }
}

// ── Category-specific page scrape ─────────────────────────────────────────
async function scrapeProductPage(name, category) {
  const sources = {
    topps:    [`https://www.topps.com/pages/${slugify(name)}`, `https://www.checklistinsider.com/${slugify(name)}`],
    pokemon:  [`https://www.pokemon.com/us/pokemon-tcg/product-line/`, `https://www.pricecharting.com/search-products?q=${encodeURIComponent(name)}&type=prices`],
    mtg:      [`https://magic.wizards.com/en/products`, `https://www.checklistinsider.com/${slugify(name)}`],
    onepiece: [`https://en.onepiece-cardgame.com/products/`, `https://www.tcgplayer.com/search/one-piece-card-game/product?q=${encodeURIComponent(name)}`],
    lego:     [`https://www.brickeconomy.com/search?q=${encodeURIComponent(name)}`],
    lorcana:  [`https://www.checklistinsider.com/${slugify(name)}`],
  };
  const urls = sources[category] ?? [];
  for (const url of urls) {
    const text = await fetchText(url);
    if (text.length > 100) return text;
  }
  return '';
}

// ── Supply score by category ───────────────────────────────────────────────
function supplyScore(category, releaseMethod, sport) {
  if (category === 'topps') {
    if (releaseMethod === 'EQL') return 20; // hard-capped
    return 35; // FCFS = more available
  }
  if (category === 'pokemon') return 18;
  if (category === 'mtg') return 15;
  if (category === 'onepiece') return 20;
  if (category === 'lego') return 12;
  if (category === 'lorcana') return 22;
  return 20;
}

// ── Extract MSRP from text ─────────────────────────────────────────────────
function extractMsrp(text) {
  const matches = [...text.matchAll(/\$(\d{2,4}(?:\.\d{2})?)/g)].map(m => parseFloat(m[1])).filter(p => p >= 10 && p <= 5000);
  if (!matches.length) return null;
  // Most-common price in range
  const freq = {};
  for (const p of matches) { const k = Math.round(p); freq[k] = (freq[k] ?? 0) + 1; }
  return parseFloat(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
}

// ── Extract release date from text ────────────────────────────────────────
function extractReleaseDate(text) {
  const patterns = [
    /releases?\s+(?:on\s+)?(\w+ \d{1,2},?\s+202[5-9])/i,
    /(?:release|ship|available)\s+(?:date[:\s]+)?(\d{1,2}\/\d{1,2}\/2[0-9])/i,
    /(\w+ \d{1,2},?\s+202[5-9])\s+(?:release|ship|available|pre-?order)/i,
    /(\d{1,2}\/\d{1,2}\/202[5-9])/,
  ];
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m) return m[1].trim();
  }
  return null;
}

// ── Detect EQL vs FCFS from text ─────────────────────────────────────────
function detectReleaseMethod(text) {
  if (/\bEQL\b|equal|raffle|allocation|limited allocation/i.test(text)) return 'EQL';
  if (/\bFCFS\b|first.come|pre.?order|open/i.test(text)) return 'FCFS';
  return 'FCFS'; // default
}

// ── Generate writeup from gathered intel ──────────────────────────────────
function generateWriteup({ name, category, sport, retail, market, ebayData, discordSnippet, ytIntel, webSnippet, releaseMethod, existingDB }) {
  const mkt = market ?? (ebayData?.median ?? null);
  const roi = (mkt && retail) ? Math.round(((mkt * 0.87 - retail * 1.08) / (retail * 1.08)) * 100) : null;
  const mult = (mkt && retail) ? (mkt / retail).toFixed(2) : null;
  const ytSummary = ytIntel?.transcript ? ytIntel.transcript.slice(0, 300) : '';

  // Extract rookie class / key players from YouTube + web
  const rookieHints = [];
  const rookieRx = /\b([A-Z][a-z]+ [A-Z][a-z]+)\s+(?:rookie|auto|RC|patch auto|numbered)/g;
  let rm;
  const searchText = (ytSummary + ' ' + webSnippet).slice(0, 2000);
  while ((rm = rookieRx.exec(searchText)) !== null) {
    rookieHints.push(rm[1]);
  }
  const rookieClass = [...new Set(rookieHints)].slice(0, 6).join(', ');

  // DB comps from existing entries
  const dbComps = existingDB ? Object.values(existingDB).slice(-5).map(e => {
    const bb = e.products?.['booster-box'] ?? e.products?.['hobby-box'];
    if (!bb) return null;
    return `${e.name ?? e.label ?? '?'} — $${bb.first ?? '?'} retail → $${bb.current ?? '?'} current / $${bb.ath ?? '?'} ATH`;
  }).filter(Boolean).join('\n') : '';

  const isTopps  = category === 'topps';
  const isPokemon = category === 'pokemon';
  const isOP     = category === 'onepiece';
  const isMTG    = category === 'mtg';
  const isLEGO   = category === 'lego';

  let marketText = '';
  let productText = '';
  let priceCompText = '';
  let supplyText = '';
  let recsText = '';

  const costBasis = retail ? `~$${(retail * 1.08).toFixed(0)}` : 'N/A';
  const breakEvenSale = retail ? `~$${(retail * 1.08 / 0.87).toFixed(0)}` : 'N/A';

  if (isTopps) {
    const sportLabel = sport === 'basketball' ? 'NBA' : sport === 'football' ? 'NFL' : 'MLB';
    marketText = [
      `• **Thesis:** ${name} — ${sportLabel} ${releaseMethod} release. ${rookieClass ? `Key auto subjects include: ${rookieClass}.` : 'Checklist drives thesis; verify rookie class depth before committing.'}`,
      `• **Liquidity:** ${releaseMethod === 'EQL' ? 'EQL allocation caps supply — independent scarcity floor regardless of rookie demand' : 'FCFS = broad retail access, uncapped supply'}. ${ebayData?.sold30 ? `${ebayData.sold30} eBay solds in 30 days confirms active market.` : 'Monitor eBay velocity post-release.'}`,
      `• **Risk:** ${roi !== null ? `${roi}% ROI at current market` : 'ROI TBD pending market data'}. ${ytIntel?.transcript?.includes('terrible') || ytIntel?.transcript?.includes('trash') ? 'Early break reviews cautionary — monitor break sentiment before buying heavy.' : releaseMethod === 'FCFS' ? 'FCFS = uncapped supply risk; no odds sheet = unknown hit distribution.' : 'EQL supply cap limits downside.'}`,
    ].join('\n');
    productText = [
      rookieClass ? `• **Key auto subjects:** ${rookieClass}` : '• Auto subjects TBD — check checklist on release day',
      ytIntel?.videoTitle ? `• Break intel from: "${ytIntel.videoTitle}" — ${ytSummary.slice(0, 150)}` : '• No break intel available pre-release',
      `• ${releaseMethod} release — ${releaseMethod === 'EQL' ? 'hard-capped supply; wins via scarcity independent of hit quality' : 'FCFS; monitor for restock or print extension'}`,
    ].join('\n');
    priceCompText = [
      retail ? `• MSRP $${retail} | Cost basis ${costBasis} (+8% tax) | Break-even sale ${breakEvenSale} (after 13% eBay fee)` : '• MSRP unconfirmed — verify before buying',
      mkt ? `• Current eBay median $${mkt} | ${ebayData?.sold30 ?? '?'} sold/30d` : '• eBay market TBD',
      dbComps ? `• Prior comps:\n${dbComps}` : '',
    ].filter(Boolean).join('\n');
    supplyText = [
      `• ${releaseMethod === 'EQL' ? 'EQL allocation = fixed supply at release; no restock mechanism' : 'FCFS = Topps prints to demand; more available than EQL releases'}`,
      `• ${sport} rookie class drives ceiling; supply scarcity sets the floor`,
      `• ${releaseMethod === 'EQL' ? 'Case: standard 8-12 boxes per case; EQL win = guaranteed allocation' : 'FCFS single-box limits typically 6/account; bots compete at release time'}`,
    ].join('\n');
    recsText = [
      retail ? `• **Cost basis: ${costBasis}** ($${retail} + ~8% tax) | eBay 13% fee on sale` : '• Confirm MSRP before buying',
      mkt && retail ? `• **Short term:** ${roi >= 20 ? `$${mkt} market = ${roi}% ROI — flip at ${mkt}-${Math.round(mkt * 1.1)} for ~$${Math.round(mkt * 0.87 - retail * 1.08)}/box` : `Market at $${mkt} = thin margin; wait for release-day hype spike above ${breakEvenSale} before selling`}` : '• Monitor eBay for first-week market establishment',
      `• **Long term:** Hold thesis requires strong ${sport} rookie class confirmation; exit if secondary drops below $${retail ? Math.round(retail * 0.95) : 'MSRP'}`,
      `• **Buy trigger:** ${releaseMethod === 'EQL' ? 'Enter max allocation on EQL; exit within 6-12 months' : 'Watch first break content — strong hits = hold signal; dud case breaks = sell into release hype immediately'}`,
    ].join('\n');

  } else if (isPokemon) {
    const ipHint = /charizard|eevee|pikachu|lugia|mewtwo/i.test(name + ' ' + webSnippet) ? 'S-tier IP (Charizard/Eevee/Pikachu family)' : /rayquaza|mewtwo/i.test(name + ' ' + webSnippet) ? 'A-tier IP' : 'IP strength TBD — verify featured Pokemon';
    marketText = [
      `• **Thesis:** ${name} — ${ipHint}. ETB is the primary hold target (2-10× trajectory, 12-18mo); booster box secondary (1.8-3.3×, 9-14mo); bundle = flip-only (3-4 weeks).`,
      `• **Liquidity:** ${ebayData?.sold30 ? `${ebayData.sold30} eBay solds/30d.` : 'Monitor eBay velocity post-release.'} Pokemon ETBs historically show strongest appreciation vs other formats.`,
      `• **Risk:** Reprint risk is the primary threat — ${/reprint|restock/i.test(webSnippet) ? '⚠️ reprint signals detected; monitor closely' : 'no reprint announced; floor holds until TPCi signals restock'}. Strong IP recovers even post-reprint; weak IP permanent discount.`,
    ].join('\n');
    productText = `• Format: ETB (9 packs + accessories), Booster Box (36 packs), Bundle (10 packs)\n• ETB wins appreciation races; booster box 30-40% less appreciated; bundle = flip-only\n• ${ipHint}`;
    priceCompText = retail ? `• MSRP $${retail} | Cost basis ${costBasis} | Break-even ${breakEvenSale}\n• ${mkt ? `eBay median $${mkt} | ${ebayData?.sold30 ?? '?'} sold/30d` : 'eBay market TBD'}\n${dbComps ? `• Comps:\n${dbComps}` : ''}` : 'Retail TBD';
    supplyText = `• TPCi reprint policy: quarterly waves; strong IP sets recover post-reprint\n• ETB OOS fastest — primary scarcity signal\n• Pokemon Millennium Print Group facility ~2028: long-hold supply risk`;
    recsText = `• **Cost basis: ${costBasis}** | eBay 13% fee\n• **ETB:** Buy at retail, hold 12-18mo for 2-10× target\n• **Booster Box:** 9-14mo hold, 1.8-3.3× target\n• **Bundle:** Flip within 3-4 weeks of OOS; revert to retail on restock`;

  } else if (isOP) {
    marketText = [
      `• **Thesis:** ${name} — One Piece booster box ($120 retail). Bandai reprint pattern: 1 wave ~3-6mo post-release, then no reprints for 2+ years. Strong Luffy/Shanks IP sets sustain 2-4× ATH.`,
      `• **Liquidity:** ${ebayData?.sold30 ? `${ebayData.sold30} eBay solds/30d.` : 'eBay velocity TBD.'} Japanese commands +20-35% premium over English.`,
      `• **Risk:** Reprint wave is expected 3-6mo post-release — buy pre-reprint or post-reprint dip. Character IP determines ceiling.`,
    ].join('\n');
    productText = `• Standard booster box: 24 packs × 12 cards = $120 retail\n• Hold target: 18-36mo post-reprint wave for 15-30%+ annualized\n• Japanese parallel market at +20-35% premium`;
    priceCompText = retail ? `• MSRP $${retail ?? 120} | Cost basis ${costBasis}\n• ${mkt ? `eBay median $${mkt}` : 'eBay TBD'}\n${dbComps ? `• OP set comps:\n${dbComps}` : ''}` : 'Retail $120 (standard booster box)';
    supplyText = `• Bandai reprint wave expected 3-6mo post-release — supply pressure window\n• Post-wave supply tightens; 2nd-year+ scarcity drives appreciation\n• Strong character IP (Luffy/Zoro/Shanks) = structural demand floor`;
    recsText = `• **Cost basis: ${costBasis}** | Buy at retail or below\n• **Flip:** Release week hype if market >$140 immediately\n• **Hold:** Buy pre-reprint announcement, hold through wave, accumulate post-dip\n• **Exit:** 18-36mo when ATH multiple reaches 2-3×`;

  } else if (isMTG) {
    const isUB = /universes beyond|walking dead|lotr|lord of the rings|fallout|marvel|doctor who|warhammer|street fighter|fortnite/i.test(name + ' ' + webSnippet);
    const isSL = /secret lair/i.test(name);
    marketText = [
      `• **Thesis:** ${isSL ? 'Secret Lair — limited print run (WotC Feb 2026 confirmed, no longer POD). Sealed appreciates post-drop.' : isUB ? 'Universes Beyond IP crossover — strongest MTG sealed category. Non-Magic fanbase drives sustained demand.' : 'Standard MTG set — reprint risk is primary threat; commodity unless crossover IP.'}`,
      `• **Liquidity:** ${ebayData?.sold30 ? `${ebayData.sold30} eBay solds/30d.` : 'Monitor post-release.'} ${isSL || isUB ? 'Collector format = hold target.' : 'Avoid unless presale velocity confirms demand.'}`,
      `• **Risk:** ${isSL ? 'IP strength determines ceiling; original-art SLs average 15-25% BELOW MSRP' : 'WotC reprint announcement = -40-70% immediate crash, no recovery.'}`,
    ].join('\n');
    productText = `• ${isSL ? 'Secret Lair: limited print drop. Hold sealed OR crack for singles. Two exit paths.' : isUB ? 'Universes Beyond: Collector Booster Box is the primary hold target (100% rare foils).' : 'Play Booster Box: flip-only if crossover IP; otherwise commodity.'}\n• Reprint risk: Standard sets always candidates; SL and UB products = safe`;
    priceCompText = retail ? `• MSRP $${retail} | Cost basis ${costBasis} | Break-even ${breakEvenSale}\n• ${mkt ? `eBay $${mkt}` : 'Market TBD'}\n${dbComps ? `• Comps:\n${dbComps}` : ''}` : 'MSRP TBD';
    supplyText = `• ${isSL ? 'Secret Lair: single print run, no restock. Supply permanently fixed at drop close.' : isUB ? 'UB Collector Booster: tight print; no reprint for original treatment cards.' : 'Standard sets: always reprint candidates. Supply never truly scarce.'}\n• WotC reprints crater price -40-70% with zero recovery`;
    recsText = `• ${isSL ? 'Buy strong IP SLs at presale; hold 6-18mo' : isUB ? 'Buy Collector Booster Box at presale; hold 12-24mo for LOTR-tier IP' : 'Skip unless confirmed crossover IP with presale velocity'}\n• Reprint announced = sell immediately, no exceptions`;

  } else {
    marketText = `• **Thesis:** ${name} — ${category} product. Verify retail, supply cap, and IP strength before committing.\n• **Liquidity:** ${ebayData?.sold30 ? `${ebayData.sold30} eBay solds/30d.` : 'Monitor eBay velocity.'}\n• **Risk:** Confirm no restock mechanism; secondary premium only holds with genuine scarcity.`;
    productText = `• ${name}\n• Retail: $${retail ?? 'TBD'}\n• Category: ${category}`;
    priceCompText = retail ? `• MSRP $${retail} | Cost basis ${costBasis} | Break-even ${breakEvenSale}\n• ${mkt ? `eBay $${mkt}` : 'Market TBD'}` : 'Retail TBD';
    supplyText = `• Supply mechanism: TBD — confirm limited print vs ongoing restock\n• Scarcity is the primary value driver; verify before holding`;
    recsText = `• Confirm retail + supply cap before buying\n• ${mkt && retail && roi !== null ? `Current ${roi}% ROI — ${roi >= 20 ? 'viable flip' : 'thin margin, wait for market to develop'}` : 'Monitor market post-release'}`;
  }

  return { market: marketText, product: productText, priceComp: priceCompText, supplyDemand: supplyText, recs: recsText, killSwitches: '' };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 fiddler-auto-add: "${productName}"\n`);

  const category = detectCategory(productName);
  const sport    = category === 'topps' ? detectSport(productName) : null;
  const key      = forceKey ?? slugify(productName);

  console.log(`  [detect] category=${category} sport=${sport ?? 'N/A'} key=${key}`);

  // 1. Check if already in dynamic-products.json
  const existingKey = findInDynamic(productName);
  if (existingKey && !hasFlag('--force')) {
    console.log(`  [found] Already in dynamic-products.json as "${existingKey}"`);
    console.log(`  [run] node fiddler-research.mjs ${existingKey}`);
    if (!dryRun && !noPost) {
      execSync(`node fiddler-research.mjs ${existingKey}`, { cwd: __dir, stdio: 'inherit' });
    }
    return;
  }

  // 2. Load DB for context
  const dbPath = DB_PATHS[category] ?? DB_PATHS.other;
  let existingDB = null;
  if (existsSync(dbPath)) {
    try {
      const db = JSON.parse(readFileSync(dbPath, 'utf8'));
      existingDB = db.sets ?? null;
    } catch { }
  }

  // 3. Gather intel in parallel
  console.log('  [intel] Gathering: eBay + YouTube + Discord + web...');
  const [ebayData, ytIntel, discordSnippet, webSnippet] = await Promise.allSettled([
    ebaySoldComps(`${productName} ${category === 'topps' ? 'Hobby Box' : category === 'pokemon' ? 'Booster Box' : category === 'onepiece' ? 'Booster Box' : ''}`),
    youtubeBreakIntel(productName),
    discordIntel(productName),
    (async () => {
      const search = await webSearch(`${productName} MSRP release date ${category === 'topps' ? 'hobby box' : 'sealed'} 2026`);
      const page = await scrapeProductPage(productName, category);
      return search + '\n' + page;
    })(),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null));

  console.log(`  [intel] eBay: ${ebayData?.median ? `median $${ebayData.median} (${ebayData.sold30} solds/30d)` : 'N/A'}`);
  console.log(`  [intel] YouTube: ${ytIntel?.videoTitle ?? 'N/A'}`);
  console.log(`  [intel] Discord: ${discordSnippet ? `${discordSnippet.slice(0, 80)}...` : 'N/A'}`);

  // 4. Extract key fields from web intel
  const allText = (webSnippet ?? '') + '\n' + (discordSnippet ?? '') + '\n' + (ytIntel?.transcript ?? '');
  const detectedRetail  = forceRetail ?? extractMsrp(allText);
  const detectedDate    = extractReleaseDate(allText);
  const releaseMethod   = detectReleaseMethod(allText + (discordSnippet ?? ''));

  console.log(`  [parse] retail=$${detectedRetail ?? 'unknown'} releaseDate=${detectedDate ?? 'unknown'} method=${releaseMethod}`);

  // 5. Generate writeup
  const writeup = generateWriteup({
    name: productName, category, sport,
    retail: detectedRetail,
    market: ebayData?.median ?? null,
    ebayData,
    discordSnippet: discordSnippet ?? '',
    ytIntel,
    webSnippet: webSnippet ?? '',
    releaseMethod,
    existingDB,
  });

  // 6. Build product entry
  const ebayQuerySuffix = category === 'topps' ? ' Hobby Box' : category === 'pokemon' ? ' Booster Box' : category === 'onepiece' ? ' Booster Box' : '';
  const entry = {
    label:          productName,
    category,
    set:            productName,
    ...(sport ? { sport } : {}),
    retail:         detectedRetail ?? null,
    retailVerified: !!detectedRetail,
    retailNote:     detectedRetail ? `$${detectedRetail} · ${releaseMethod}${detectedDate ? ` · ${detectedDate}` : ''}` : 'MSRP unconfirmed',
    releaseUrl:     null,
    tcgId:          null,
    supplyScore:    supplyScore(category, releaseMethod, sport),
    ebayQuery:      productName + ebayQuerySuffix,
    images:         [],
    boxConfig:      category === 'topps' ? { cardsPerBox: 7, autosPerBox: 1 } : category === 'pokemon' ? { cardsPerBox: 9, autosPerBox: 0 } : null,
    releaseDate:    detectedDate ?? 'TBD',
    ...(category === 'topps' ? { releaseMethod } : {}),
    sellThrough: {
      flip:   ebayData?.median ? { range: `$${Math.round(ebayData.median * 0.9)} – $${Math.round(ebayData.median * 1.05)}`, units: '~20 – 50 units' } : { range: 'TBD', units: 'TBD' },
      hold:   ebayData?.median ? { range: `$${Math.round(ebayData.median * 1.0)} – $${Math.round(ebayData.median * 1.25)}`, units: '~10 – 25 units' } : { range: 'TBD', units: 'TBD' },
      invest: { range: 'TBD — hold 12mo+', units: '~5 – 10 units' },
    },
    bulkBuy:   '3 – 6 units',
    risk:      '🟡 Medium',
    ebayFee:   0.13,
    writeup,
  };

  if (dryRun) {
    console.log('\n[dry-run] Entry:\n', JSON.stringify(entry, null, 2));
    return;
  }

  // 7. Write to dynamic-products.json
  const dp = existsSync(DYNAMIC_PATH) ? JSON.parse(readFileSync(DYNAMIC_PATH, 'utf8')) : {};
  dp[key] = entry;
  writeFileSync(DYNAMIC_PATH, JSON.stringify(dp, null, 2) + '\n');
  console.log(`\n  ✅ Written to dynamic-products.json as "${key}"`);

  // 8. Append to category DB
  if (existingDB !== null && detectedRetail) {
    const db = JSON.parse(readFileSync(dbPath, 'utf8'));
    const sets = db.sets ?? (db.sets = {});
    if (!sets[key]) {
      sets[key] = {
        key, name: productName, category,
        ...(sport ? { sport } : {}),
        retail: detectedRetail,
        addedDate: new Date().toISOString().slice(0, 10),
        products: {
          'hobby-box': ebayData?.median ? { current: ebayData.median, first: ebayData.median, ath: ebayData.high ?? ebayData.median } : {},
        },
      };
      writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n');
      console.log(`  ✅ Appended to ${dbPath}`);
    }
  }

  // 9. Run pipeline
  if (!noPost) {
    console.log(`\n  🚀 Running: node fiddler-research.mjs ${key}\n`);
    execSync(`node fiddler-research.mjs ${key}`, { cwd: __dir, stdio: 'inherit' });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
