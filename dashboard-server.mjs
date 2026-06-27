/**
 * Fiddler Dashboard Server
 * Usage: node dashboard-server.mjs
 * Opens: http://localhost:3434
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3434;

// ── Failsafe #2: live version stamp ───────────────────────────────────────────
// Server captures its start time. /api/version compares the newest mtime of the
// tracked source files to that start time — if any source is newer, the running
// process is serving STALE code (needs restart). With one --watch instance this
// is always fresh; the endpoint lets the UI PROVE the user is seeing live code.
const START_TIME = Date.now();
const VERSION_FILES = ['dashboard-server.mjs', 'fiddler-research.mjs', 'lib/deep-research.mjs'];
function versionInfo() {
  let newest = 0;
  for (const f of VERSION_FILES) {
    try { newest = Math.max(newest, fs.statSync(path.join(ROOT, f)).mtimeMs); } catch {}
  }
  return {
    pid: process.pid,
    startedAt: new Date(START_TIME).toISOString(),
    newestSourceMtime: new Date(newest).toISOString(),
    stale: newest > START_TIME,   // true = code edited after server started → restart needed
  };
}

const DBS = {
  pokemon:   { file: 'set-history.json',           label: 'Pokemon TCG',  icon: '🃏', keyField: 'sets' },
  mtg:       { file: 'set-history-mtg.json',        label: 'MTG',          icon: '🧙', keyField: 'sets' },
  lorcana:   { file: 'set-history-lorcana.json',    label: 'Lorcana',      icon: '🌸', keyField: 'sets' },
  sports:    { file: 'set-history-sports.json',     label: 'Sports Cards', icon: '🏀', keyField: 'sets' },
  other_tcg: { file: 'set-history-other-tcg.json',  label: 'Other TCG',   icon: '⚡', keyField: 'sets' },
  one_piece: { file: 'set-history-one-piece.json',  label: 'One Piece',    icon: '🏴‍☠️', keyField: 'sets' },
  lego:      { file: 'set-history-lego.json',       label: 'LEGO',         icon: '🧱', keyField: 'sets' },
  noncard:   { file: 'set-history-noncard.json',    label: 'Toys / Vinyl', icon: '🎁', keyField: 'sets' },
  mattel:    { file: 'set-history-mattel.json',      label: 'Mattel',       icon: '🚗', keyField: 'sets' },
  disney_cards:  { file: 'set-history-disney-cards.json',  label: 'Disney Cards',   icon: '🏰', keyField: 'sets' },
  veefriends:    { file: 'set-history-veefriends.json',    label: 'VeeFriends',     icon: '🐸', keyField: 'sets' },
  weiss:         { file: 'set-history-weiss.json',          label: 'Weiss Schwarz',      icon: '🎌', keyField: 'sets' },
  union_arena:   { file: 'set-history-union-arena.json',    label: 'Union Arena',        icon: '⚔️', keyField: 'sets' },
  gundam:        { file: 'set-history-gundam.json',         label: 'Gundam TCG',         icon: '🤖', keyField: 'sets' },
  yugioh:        { file: 'set-history-yugioh.json',         label: 'Yu-Gi-Oh',           icon: '👁️', keyField: 'sets' },
  cardfight:     { file: 'set-history-cardfight.json',      label: 'Cardfight Vanguard', icon: '⚡', keyField: 'sets' },
  dragon_ball:   { file: 'set-history-dragon-ball.json',    label: 'Dragon Ball',        icon: '🐉', keyField: 'sets' },
  fab:           { file: 'set-history-fab.json',            label: 'Flesh & Blood',      icon: '⚔️', keyField: 'sets' },
  digimon:       { file: 'set-history-digimon.json',        label: 'Digimon',            icon: '🦕', keyField: 'sets' },
  sorcery:       { file: 'set-history-sorcery.json',        label: 'Sorcery',            icon: '🔮', keyField: 'sets' },
  star_wars:     { file: 'set-history-star-wars.json',      label: 'Star Wars Unlimited',icon: '⭐', keyField: 'sets' },
  hololive:      { file: 'set-history-hololive.json',       label: 'hololive TCG',       icon: '🎤', keyField: 'sets' },
  players:       { file: 'player-history-sports.json',      label: 'Sports Players',      icon: '🏃', keyField: 'players' },
};

function readJson(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// Player cache — parse 28k-record JSON once, not per request
let _playersCache = null;
function getPlayersCache() {
  if (_playersCache) return _playersCache;
  const raw = readJson('player-history-sports.json');
  _playersCache = Object.values(raw?.players ?? {});
  console.log(`[players-cache] loaded ${_playersCache.length} records`);
  return _playersCache;
}

function getDbEntries(dbKey) {
  const cfg = DBS[dbKey];
  if (!cfg) return [];
  const raw = readJson(cfg.file);
  if (!raw) return [];

  // Player DB: flat list keyed by sport_slug
  if (cfg.keyField === 'players') {
    const players = raw.players ?? {};
    return Object.entries(players)
      .map(([id, p]) => {
        const topCard = (p.cards ?? []).sort((a, b) => (b.pcMarket ?? 0) - (a.pcMarket ?? 0))[0] ?? null;
        return {
          id, name: p.name ?? id, sport: p.sport, position: p.position,
          rookie_year: p.rookie_year, cardCount: (p.cards ?? []).length,
          topCard: topCard ? { cardType: topCard.cardType, setName: topCard.setName, pcMarket: topCard.pcMarket } : null,
        };
      })
      .filter(p => p.name)
      .sort((a, b) => (b.topCard?.pcMarket ?? 0) - (a.topCard?.pcMarket ?? 0));
  }

  const sets = raw.sets ?? raw.db?.sets ?? raw;
  if (typeof sets !== 'object' || Array.isArray(sets)) return [];
  return Object.entries(sets)
    .map(([id, entry]) => {
      const fc = entry.cards?.fullCardList ?? [];
      const cc = entry.cards?.chaseCards ?? [];
      // For sports sets: use chaseCards[]; for TCG: use fullCardList by market
      let chase = null;
      if (cc.length) {
        chase = cc[0]; // already sorted by price desc
      } else if (fc.length) {
        chase = fc.reduce((a, b) => ((b.market ?? 0) > (a.market ?? 0) ? b : a), fc[0]);
      }
      return { id, ...entry, chaseCard: chase ? { name: chase.player ?? chase.name, market: chase.price ?? chase.market, rarity: chase.cardType ?? chase.rarity } : null };
    })
    .sort((a, b) => {
      const da = a.publishedOn ?? '0', db2 = b.publishedOn ?? '0';
      return da < db2 ? 1 : da > db2 ? -1 : 0;
    });
}

function fuzzyMatch(text, entries) {
  const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const needle = norm(text);
  const numMatch = text.match(/\b(\d{4,6})\b/)?.[1];
  const scored = entries.map(e => {
    let score = 0;
    const name = norm(e.name ?? e.setName ?? '');
    const id   = norm(e.id ?? e.setNum ?? '');
    if (numMatch && (id.includes(numMatch) || norm(e.id ?? '').includes(numMatch))) score += 80;
    if (name === needle) score += 100;
    else if (name.includes(needle) || needle.includes(name)) score += 50;
    else {
      // Levenshtein-lite: count matching 3-grams
      const ngrams = s => { const r = new Set(); for (let i=0;i<s.length-2;i++) r.add(s.slice(i,i+3)); return r; };
      const na = ngrams(needle), nb = ngrams(name);
      let common = 0; na.forEach(g => { if (nb.has(g)) common++; });
      score += Math.round((common / Math.max(na.size, nb.size, 1)) * 40);
    }
    return { entry: e, score };
  });
  return scored.filter(s => s.score >= 20).sort((a, b) => b.score - a.score).slice(0, 5).map(s => s.entry);
}

function getProducts() {
  // Load static products from fiddler-research.mjs — extract key + label
  const raw = fs.readFileSync(path.join(ROOT, 'fiddler-research.mjs'), 'utf8');
  const entries = new Map(); // key → label
  const keyRe = /^\s*'([a-z0-9][a-z0-9-]+)':\s*\{/gm;
  let m;
  while ((m = keyRe.exec(raw)) !== null) {
    if (!m[1].includes('-')) continue;
    const key = m[1];
    // Try to find label: field immediately after the key block opening
    const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 300);
    const lm = after.match(/label\s*:\s*['"]([^'"]+)['"]/);
    entries.set(key, lm ? lm[1] : key);
  }
  // Merge dynamic-products.json
  const dyn = readJson('dynamic-products.json') ?? {};
  for (const [k, v] of Object.entries(dyn)) {
    entries.set(k, v?.label ?? k);
  }
  return [...entries.entries()].map(([key, label]) => ({ key, label }));
}

function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return {};
  return fs.readFileSync(p, 'utf8').split('\n').reduce((acc, line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m) acc[m[1]] = m[2];
    return acc;
  }, {});
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  // GET /api/version — failsafe #2: prove the running process is serving live code
  if (req.method === 'GET' && pathname === '/api/version') { json(res, versionInfo()); return; }

  // Serve dashboard HTML
  if (req.method === 'GET' && pathname === '/') {
    const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'index.html'), 'utf8');
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // GET /api/databases — list all DBs with counts
  if (req.method === 'GET' && pathname === '/api/databases') {
    const result = {};
    for (const [key, cfg] of Object.entries(DBS)) {
      const entries = getDbEntries(key);
      const raw = readJson(cfg.file);
      result[key] = {
        label: cfg.label, icon: cfg.icon,
        count: entries.length,
        updated: raw?._meta?.updated ?? raw?._meta?.lastUpdated?.slice(0,10) ?? raw?.db?._meta?.updated ?? null,
        source:  raw?._meta?.source  ?? raw?.db?._meta?.source  ?? null,
      };
    }
    json(res, result);
    return;
  }

  // GET /api/db/:name?q=&page=&limit=
  const dbMatch = pathname.match(/^\/api\/db\/([a-z_]+)$/);
  if (req.method === 'GET' && dbMatch) {
    const dbKey  = dbMatch[1];
    const q      = url.searchParams.get('q') ?? '';
    const year   = url.searchParams.get('year') ?? '';
    const page   = parseInt(url.searchParams.get('page') ?? '1', 10);
    const limit  = parseInt(url.searchParams.get('limit') ?? '50', 10);
    let entries  = getDbEntries(dbKey);
    const sport  = url.searchParams.get('sport') ?? '';
    if (q) {
      const norm  = s => String(s ?? '').toLowerCase();
      const needle = norm(q);
      entries = entries.filter(e =>
        norm(e.name ?? e.setName ?? e.set_name ?? '').includes(needle) ||
        norm(e.id ?? e.setNum ?? '').includes(needle)
      );
    }
    if (sport) entries = entries.filter(e => (e.sport ?? '') === sport);
    // collect unique years from all entries (before year filter)
    const yearSet = new Set();
    entries.forEach(e => { const y = (e.publishedOn ?? e.releasedOn ?? '').slice(0,4); if (y >= '2000') yearSet.add(y); });
    const years = [...yearSet].sort((a,b) => b.localeCompare(a));
    if (year) entries = entries.filter(e => (e.publishedOn ?? e.releasedOn ?? '').startsWith(year));
    // collect sports for player DB
    const sportSet = new Set(entries.map(e => e.sport).filter(Boolean));
    const sports = [...sportSet].sort();
    const total = entries.length;
    const slice = entries.slice((page - 1) * limit, page * limit);
    json(res, { total, page, limit, entries: slice, years, sports });
    return;
  }

  // GET /api/db/:name/:setId/variants — product variants for a set
  const variantMatch = pathname.match(/^\/api\/db\/([a-z_]+)\/([a-z0-9-]+)\/variants$/);
  if (req.method === 'GET' && variantMatch) {
    const [, dbKey, setId] = variantMatch;
    const cfg = DBS[dbKey];
    if (!cfg) { json(res, { error: 'Unknown DB' }, 404); return; }
    const raw = readJson(cfg.file);
    if (!raw) { json(res, { error: 'DB not found' }, 404); return; }
    const sets = raw.sets ?? raw.db?.sets ?? raw;
    const set = sets[setId];
    if (!set) { json(res, { error: 'Set not found' }, 404); return; }
    const products = set.products ?? {};
    const variants = Object.entries(products).map(([key, data]) => {
      const hist = data.priceHistory ?? [];
      const prices = hist.map(h => h.price).filter(p => p > 0);
      const current = data.market ?? data.current ?? null;
      const ath = prices.length ? Math.max(...prices) : (data.ath ?? null);
      const first = hist.length ? hist[0].price : (data.first ?? null);
      const months = (hist.length > 1)
        ? +((new Date(hist.at(-1).date) - new Date(hist[0].date)) / (1000*60*60*24*30.5)).toFixed(1)
        : (data.months ?? null);
      const label = data.name ?? key.split('-').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
      return { key, name: label, current, ath, first, months, msrp: data.msrp ?? data.retail ?? null, low: data.low ?? null, high: data.high ?? null };
    }).filter(v => v.name && !/(^code-card|^dratini$)/i.test(v.key));
    json(res, { setId, setName: set.name ?? set.set_name ?? set.setName, variants });
    return;
  }

  // GET /api/db/:name/:setId/cards — individual cards (fullCardList) for a set
  const cardsMatch = pathname.match(/^\/api\/db\/([a-z_]+)\/([a-z0-9-]+)\/cards$/);
  if (req.method === 'GET' && cardsMatch) {
    const [, dbKey, setId] = cardsMatch;
    const cfg = DBS[dbKey];
    if (!cfg) { json(res, { error: 'Unknown DB' }, 404); return; }
    const raw = readJson(cfg.file);
    if (!raw) { json(res, { error: 'DB not found' }, 404); return; }
    const sets = raw.sets ?? raw.db?.sets ?? raw;
    const set = sets[setId];
    if (!set) { json(res, { error: 'Set not found' }, 404); return; }
    // Support both TCG fullCardList and sports chaseCards
    const fullList = set.cards?.fullCardList ?? [];
    const chaseList = set.cards?.chaseCards ?? [];
    const list = fullList.length ? fullList.slice() : chaseList.slice();
    if (fullList.length) list.sort((a, b) => (b.market ?? 0) - (a.market ?? 0));
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 500);
    const cards = list.slice(0, limit).map(c => ({
      name: c.player ?? c.name,
      market: c.price ?? c.market ?? null,
      rarity: c.cardType ?? c.rarity ?? null,
      number: c.number ?? null,
      points: (c.priceHistory ?? []).length,
      lastDate: (c.priceHistory ?? []).slice(-1)[0]?.date ?? c.fetchedAt ?? null,
      star: c.star ?? false,
      printRun: c.printRun ?? null,
    }));
    json(res, { setId, total: list.length, fetchedAt: set.cards?.fetchedAt ?? null, cards });
    return;
  }

  // GET /api/products — list all product keys
  if (req.method === 'GET' && pathname === '/api/products') {
    json(res, getProducts());
    return;
  }

  // GET /api/pipeline-status — last run results
  if (req.method === 'GET' && pathname === '/api/pipeline-status') {
    const r = readJson('pipeline-results.json');
    json(res, r ?? { error: 'No pipeline run yet. Run node fiddler-research.mjs <key> first.' });
    return;
  }

  // POST /api/ingest — paste text or URL, fuzzy match to DB, append data
  if (req.method === 'POST' && pathname === '/api/ingest') {
    const { text, url: ingestUrl, targetDb } = await body(req);
    const combined = [text, ingestUrl].filter(Boolean).join(' ');
    if (!combined.trim()) { json(res, { error: 'No text or URL provided' }, 400); return; }
    const dbKey = targetDb ?? 'pokemon';
    const entries = getDbEntries(dbKey);
    const matches = fuzzyMatch(combined, entries);
    json(res, { matches, hint: matches.length ? `Top match: ${matches[0].name ?? matches[0].id}` : 'No match found — may need manual entry' });
    return;
  }

  // POST /api/research — spawn pipeline, SSE stream output
  if (req.method === 'POST' && pathname === '/api/research') {
    const { key, retail, url: intelUrl, notes, category } = await body(req);
    if (!key) { json(res, { error: 'product key required' }, 400); return; }
    cors(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    send('start', { key, ts: new Date().toISOString() });
    // Pass form fields as env vars — pipeline merges them into prod before running
    const spawnEnv = { ...process.env, DASHBOARD_MODE: '1', EVIDENCE_OK: '1', SKIP_WRITEUP_CHECK: '1', SKIP_RETAIL_CHECK: '1' };
    if (retail)   spawnEnv.USER_RETAIL   = String(retail);
    if (intelUrl) spawnEnv.USER_URL      = intelUrl;
    if (notes)    spawnEnv.USER_NOTES    = notes;
    if (category) spawnEnv.USER_CATEGORY = category;
    const child = spawn('node', ['fiddler-research.mjs', key], { cwd: ROOT, env: spawnEnv });
    child.stdout.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      for (const line of lines) send('log', { line });
    });
    child.stderr.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      for (const line of lines) send('err', { line });
    });
    child.on('close', code => {
      const result = readJson('pipeline-results.json');
      send('done', { code, result });
      res.end();
    });
    req.on('close', () => child.kill());
    return;
  }

  // POST /api/create-product — stub new product into dynamic-products.json
  if (req.method === 'POST' && pathname === '/api/create-product') {
    const { name, category, url, notes, retail } = await body(req);
    if (!name) { json(res, { error: 'name required' }, 400); return; }
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const dynPath = path.join(ROOT, 'dynamic-products.json');
    let dyn = readJson('dynamic-products.json') ?? {};
    if (dyn[key]) { json(res, { key, existed: true }); return; }
    // Server-side fuzzy guard: reject stub if any existing product matches ≥25 score
    const allProducts = getProducts();
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ngrams = s => { const r = new Set(); for (let i=0; i<s.length-2; i++) r.add(s.slice(i,i+3)); return r; };
    const needle = norm(name);
    const na = ngrams(needle);
    const scored = allProducts.map(({ key: k, label }) => {
      const kn = norm(k), ln = norm(label ?? k);
      const score = Math.max(...[kn, ln].map(c => {
        if (c === needle || c.includes(needle) || needle.includes(c)) return 80;
        const nb = ngrams(c); let cnt = 0; na.forEach(g => { if (nb.has(g)) cnt++; });
        return Math.round((cnt / Math.max(na.size, nb.size, 1)) * 60);
      }));
      return { k, label, score };
    }).filter(s => s.score >= 25).sort((a, b) => b.score - a.score);
    if (scored.length) {
      const best = scored[0];
      json(res, { key: best.k, existed: true, fuzzyMatch: true, label: best.label, score: best.score,
        error: `Fuzzy match found: "${best.label}" (${best.k}, score ${best.score}) — use that key instead of creating a stub` }, 409);
      return;
    }
    // Reject if key already exists in static map (fiddler-research.mjs) — prevents stub shadowing
    const staticKeys = allProducts.map(p => p.key).filter(k => !Object.keys(dyn).includes(k));
    if (staticKeys.includes(key)) { json(res, { key, existed: true, static: true, error: 'Key exists in static map — use that key directly, do not create dynamic stub' }, 409); return; }
    // Extract direct IDs from URLs for accurate pricing
    const walmartIdMatch = url && url.match(/walmart\.com\/ip\/[^/]+\/(\d{8,})/);
    const walmartItemId  = walmartIdMatch ? walmartIdMatch[1] : null;
    const amazonAsinMatch = url && url.match(/amazon\.com\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    const upc = amazonAsinMatch ? amazonAsinMatch[1] : null;

    // Auto-detect category + derive clean set name from product name keywords.
    // Order matters: most specific first. One Piece BEFORE generic TCG/noncard.
    const nameLc = name.toLowerCase();
    const detectedCategory = category
      || (/\bpokemon|pok[eé]mon|ptcg\b/i.test(nameLc)                                   ? 'pokemon'   : null)
      || (/\bone[\s-]?piece\b|\bop-?\d{2}\b|\beb-?\d{2}\b|\bprb-?\d{2}\b|\bst-?\d{2}\b/i.test(nameLc) ? 'one_piece' : null)
      || (/\blorcana|disney lorcana\b/i.test(nameLc)                                    ? 'other_tcg' : null)
      || (/\b(topps|kakawow).*(disney|disneyland|pixar)|(disney).*(topps|chrome|kakawow)/i.test(nameLc) ? 'disney_cards' : null)
      || (/\bmtg\b|magic.*gathering|secret lair/i.test(nameLc)                          ? 'mtg'       : null)
      || (/\btopps|panini|bowman|sports card|baseball|basketball|football|soccer|ufc|nba|nfl|mlb\b/i.test(nameLc) ? 'topps' : null)
      || (/\blego\b/i.test(nameLc)                                                      ? 'lego'      : null)
      || (/\bweiss|union arena|gundam|digimon|dragon ball|flesh and blood|fab\b/i.test(nameLc) ? 'other_tcg' : null)
      || 'noncard';

    // Auto-extract set code (OP13 / EB-01 / PRB-01 / ST20 / SV8a etc) if present.
    const codeMatch = name.match(/\b((?:OP|EB|PRB|ST|SV|EX|EB)-?\d{1,2}[a-z]?)\b/i);
    const code = codeMatch ? codeMatch[1].toUpperCase() : null;

    // Derive set name: brand/IP portion (strip format words)
    const setFromName = name
      .replace(/\b(hobby box|hobby|booster box|booster|blaster pack|blister pack|blaster|blister|display box|display|case|bundle|sealed|pre-?order|presale|unknown|english|\d+ pack[s]?)\b/gi, '')
      .replace(/\s+/g,' ').trim()
      || name;

    // eBay query: keep format words (improves SKU specificity), add "English sealed" for TCG.
    const isTcg = ['pokemon','one_piece','other_tcg','mtg'].includes(detectedCategory);
    const ebayQ = (name.replace(/\s+/g,' ').trim() + (isTcg && !/english/i.test(name) ? ' English sealed' : '')) || name;

    dyn[key] = {
      label:    name,
      category: detectedCategory,
      retail:   retail ?? null,        // null → pipeline auto-fills from StockX MSRP / retail signals
      set:      setFromName,
      ...(code ? { code } : {}),
      images:   [],
      ebayQuery: ebayQ,
      ...(url          ? { releaseUrl: url }    : {}),
      ...(walmartItemId? { walmartItemId }       : {}),
      ...(upc          ? { upc }                : {}),
      // preRelease:false → pipeline always computes a market from live signals. The pipeline
      // itself re-suppresses to "pre-release" ONLY when there are no real eBay sold comps
      // (see _ebayHasRealSales in fiddler-research.mjs). Never blanket-flag new products unreleased.
      preRelease:  false,
      evidence: notes ? [{ source: 'User intake', date: new Date().toISOString().slice(0,10), point: notes.slice(0,200) }] : [],
      // Empty writeup → the pipeline's category-aware auto-synthesis (Thesis/Liquidity/Risk +
      // Bear/Base/Bull) fills every field from live signals. Same flywheel as CLI, all categories.
      writeup: {
        market:        '',
        product:       notes || '',
        priceComp:     '',
        supplyDemand:  '',
        recs:          '',
      },
    };
    fs.writeFileSync(dynPath, JSON.stringify(dyn, null, 2));
    json(res, { key, created: true });
    return;
  }

  // POST /api/confirm-db-save — user-gated DB append. Writes the STAGED pipelineResult.dbAppend
  // into its category set-history DB (upsert into .sets, append-not-overwrite). Only on confirm.
  if (req.method === 'POST' && pathname === '/api/confirm-db-save') {
    const payload = await body(req);
    const dbAppend = payload?.dbAppend ?? readJson('pipeline-results.json')?.dbAppend;
    if (!dbAppend?.dbFile || !dbAppend?.key || !dbAppend?.record) { json(res, { error: 'no dbAppend payload' }, 400); return; }
    const dbPath = path.join(ROOT, dbAppend.dbFile);
    let db = readJson(dbAppend.dbFile) ?? { _meta: {}, sets: {} };
    if (!db.sets) db.sets = {};
    const prev = db.sets[dbAppend.key];
    // Append-not-overwrite: keep a dated history array of prior observations.
    const history = Array.isArray(prev?.history) ? prev.history : (prev ? [{ market: prev.market ?? prev.marketAtResearch ?? null, rating: prev.rating ?? null, dateLogged: prev.dateLogged ?? null }] : []);
    db.sets[dbAppend.key] = { ...prev, ...dbAppend.record, key: dbAppend.key, history: [...history, { market: dbAppend.record.market, rating: dbAppend.record.rating, soldMedian: dbAppend.record.soldMedian, dateLogged: dbAppend.record.dateLogged }].slice(-24) };
    db._meta = { ...(db._meta ?? {}), updated: dbAppend.record.dateLogged };
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n');
    json(res, { saved: true, dbFile: dbAppend.dbFile, key: dbAppend.key });
    return;
  }

  // GET /api/research-log — all pipeline run history
  if (req.method === 'GET' && pathname === '/api/research-log') {
    const log = readJson('research-log.json') ?? [];
    json(res, log.slice().reverse()); // newest first
    return;
  }

  // GET /api/webhooks — list configured webhooks
  if (req.method === 'GET' && pathname === '/api/webhooks') {
    const env = loadEnv();
    const whs = [
      { name: 'Fiddler',   url: env.EXTERNAL_WEBHOOK_URL },
      { name: 'Channel 2', url: env.WEBHOOK_2 },
      { name: 'Channel 3', url: env.WEBHOOK_3 },
      { name: 'Channel 4', url: env.WEBHOOK_4 },
      { name: 'Channel 5', url: env.WEBHOOK_5 },
    ].filter(w => w.url);
    json(res, whs);
    return;
  }

  // POST /api/send-embed — send stored embedPayload to a webhook
  if (req.method === 'POST' && pathname === '/api/send-embed') {
    const { embedPayload, webhookUrl } = await body(req);
    if (!embedPayload) { json(res, { error: 'No embedPayload provided' }, 400); return; }
    const env = loadEnv();
    const webhook = webhookUrl || env.EXTERNAL_WEBHOOK_URL;
    if (!webhook) { json(res, { error: 'No webhook URL — set EXTERNAL_WEBHOOK_URL in .env or pass webhookUrl' }, 500); return; }
    try {
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embedPayload] }),
      });
      const text = await r.text();
      json(res, { ok: r.ok, status: r.status, body: text });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // GET /api/webhook-history — return all history entries (newest first)
  if (req.method === 'GET' && pathname === '/api/webhook-history') {
    const whFile = path.join(ROOT, 'webhook-history.json');
    let entries = [];
    if (fs.existsSync(whFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(whFile, 'utf8'));
        entries = Array.isArray(raw) ? raw : [];
      } catch {}
    }
    entries.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const recent = entries.slice(0, 200);
    json(res, recent);
    return;
  }

  // POST /api/webhook-history — log a new webhook send
  if (req.method === 'POST' && pathname === '/api/webhook-history') {
    const { productKey, productLabel, category, webhookName, webhookUrl, pricingSnapshot, sentimentSnapshot, embedTitle, embedDescription, computedRating } = await body(req);
    const whFile = path.join(ROOT, 'webhook-history.json');
    let entries = [];
    if (fs.existsSync(whFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(whFile, 'utf8'));
        entries = Array.isArray(raw) ? raw : [];
      } catch {}
    }
    const entry = {
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      ts: new Date().toISOString(),
      productKey,
      productLabel,
      category,
      rating: null,
      commentary: '',
      webhookName,
      webhookUrl,
      pricingSnapshot: pricingSnapshot ?? {},
      sentimentSnapshot: sentimentSnapshot ?? {},
      embedTitle,
      embedDescription,
      computedRating: computedRating ?? 'ORANGE',
    };
    entries.push(entry);
    fs.writeFileSync(whFile, JSON.stringify(entries, null, 2));
    json(res, entry);
    return;
  }

  // POST /api/webhook-history/:id/rate — rate an entry and optionally append to lessons.md
  const rateMatch = pathname.match(/^\/api\/webhook-history\/([^/]+)\/rate$/);
  if (req.method === 'POST' && rateMatch) {
    const entryId = rateMatch[1];
    const { rating, commentary } = await body(req);
    const whFile = path.join(ROOT, 'webhook-history.json');
    let entries = [];
    if (fs.existsSync(whFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(whFile, 'utf8'));
        entries = Array.isArray(raw) ? raw : [];
      } catch {}
    }
    const entry = entries.find(e => e.id === entryId);
    if (!entry) { json(res, { error: 'Entry not found' }, 404); return; }
    entry.rating = rating;
    entry.commentary = commentary ?? '';
    fs.writeFileSync(whFile, JSON.stringify(entries, null, 2));
    // If yellow or red, append to lessons.md
    if (rating === 'YELLOW' || rating === 'RED') {
      const homeDir = process.env.USERPROFILE ?? process.env.HOME ?? '';
      const lessonsPath = process.env.LESSONS_PATH ?? path.join(homeDir, '.claude', 'lessons.md');
      const dateStr = new Date().toISOString().slice(0, 10);
      const ruleText = (commentary ?? '').trim().slice(0, 200);
      const ruleLabel = rating === 'RED' ? 'WRONG analysis' : 'PARTIAL analysis';
      const line = `- [${dateStr}] (jester-researcher) ${entry.productLabel} — ${ruleLabel} -> ${ruleText || 'no commentary'} -> RULE: factor this in before similar ${entry.category ?? 'product'} analysis`;
      try {
        const existing = fs.existsSync(lessonsPath) ? fs.readFileSync(lessonsPath, 'utf8') : '';
        fs.writeFileSync(lessonsPath, existing + '\n' + line + '\n');
      } catch {}
    }
    json(res, entry);
    return;
  }

  // GET /api/channel-meta/:channelId — return channel name/type
  const metaMatch = pathname.match(/^\/api\/channel-meta\/(\d+)$/);
  if (req.method === 'GET' && metaMatch) {
    const env = loadEnv();
    const token = env.DISCORD_USER_TOKEN;
    if (!token) { json(res, { error: 'DISCORD_USER_TOKEN not set' }, 500); return; }
    try {
      const r = await fetch(`https://discord.com/api/v9/channels/${metaMatch[1]}`, {
        headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' },
      });
      if (!r.ok) { json(res, { error: `Discord ${r.status}` }, r.status); return; }
      const ch = await r.json();
      json(res, { id: ch.id, name: ch.name, type: ch.type, guild_id: ch.guild_id });
    } catch (e) { json(res, { error: e.message }, 500); }
    return;
  }

  // GET /api/channel-feed/:channelId?limit=&before= — proxy Discord channel messages via user token
  const feedMatch = pathname.match(/^\/api\/channel-feed\/(\d+)$/);
  if (req.method === 'GET' && feedMatch) {
    const channelId = feedMatch[1];
    const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const before = url.searchParams.get('before') ?? '';
    const env = loadEnv();
    const token = env.DISCORD_USER_TOKEN;
    if (!token) { json(res, { error: 'DISCORD_USER_TOKEN not set in .env' }, 500); return; }
    const qs = `limit=${limit}${before ? `&before=${before}` : ''}`;
    try {
      const r = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages?${qs}`, {
        headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' },
      });
      if (!r.ok) { json(res, { error: `Discord ${r.status}`, body: await r.text() }, r.status); return; }
      const msgs = await r.json();
      json(res, msgs);
    } catch (e) { json(res, { error: e.message }, 500); }
    return;
  }

  // GET /api/docs — list all .md files with content
  if (req.method === 'GET' && pathname === '/api/docs') {
    const mdFiles = ['FIDDLER.md','RATING-LOGIC.md','EMBED-FORMAT.md','WRITEUP-FORMAT.md',
                     'PRICING-MECHANICS.md','DATA-QUALITY.md','CATEGORY-MECHANICS.md'];
    const result = mdFiles.map(f => {
      const p = path.join(ROOT, f);
      return { name: f, content: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '*(file not found)*' };
    });
    // Reference Library — synthesized investment/pricing books (PDF distillations)
    const refDir = path.join(ROOT, 'memory', 'research');
    const refDocs = [
      ['📘 Intelligent Investor (Graham)', 'intelligent-investor-collectibles.md'],
      ['📗 Trading on Sentiment (Peterson)', 'sentiment-trading-collectibles.md'],
      ['📙 Valuation Principles (Anvari)', 'valuation-principles-collectibles.md'],
      ['📕 Professional Pricing (PPS Journal)', 'pps-pricing-collectibles.md'],
    ];
    const refSet = new Set(refDocs.map(d => d[1]));
    for (const [label, fn] of refDocs) {
      const p = path.join(refDir, fn);
      if (fs.existsSync(p)) result.push({ name: label, content: fs.readFileSync(p, 'utf8') });
    }
    // Category Expertise — every other memory/research/*.md, auto-listed
    if (fs.existsSync(refDir)) {
      for (const fn of fs.readdirSync(refDir).filter(f => f.endsWith('.md') && !refSet.has(f)).sort()) {
        const label = '🎓 ' + fn.replace(/\.md$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        result.push({ name: label, content: fs.readFileSync(path.join(refDir, fn), 'utf8') });
      }
    }
    json(res, result);
    return;
  }

  // GET /api/players?q=&sport=&page=&limit= — player-history-sports.json
  if (req.method === 'GET' && pathname === '/api/players') {
    const all = getPlayersCache();
    const q     = (url.searchParams.get('q')     ?? '').toLowerCase();
    const sport = (url.searchParams.get('sport') ?? '').toLowerCase();
    const page  = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10));
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') ?? '50', 10));
    const filtered = all.filter(p => {
      if (!p.name) return false;
      if (sport && p.sport !== sport) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.slug?.includes(q)) return false;
      return true;
    });
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit).map(p => {
      const topCard = p.cards?.length > 0
        ? [...p.cards].sort((a, b) => (b.pcMarket ?? 0) - (a.pcMarket ?? 0))[0]
        : null;
      return {
        slug: p.slug, name: p.name, sport: p.sport, position: p.position,
        rookie_year: p.rookie_year,
        cards: p.cards ?? [],
        topCard: topCard ? { cardType: topCard.cardType, setName: topCard.setName, pcMarket: topCard.pcMarket } : null,
      };
    });
    json(res, { total, page, limit, items });
    return;
  }

  // GET /api/players/chase — all players with cards[], sorted by top card value
  if (req.method === 'GET' && pathname === '/api/players/chase') {
    const all = getPlayersCache();
    const sport = (url.searchParams.get('sport') ?? '').toLowerCase();
    const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '100', 10));
    const withCards = all
      .filter(p => p.name && p.cards?.length > 0 && (!sport || (p.cards[0]?.setKey ?? '').includes(sport)))
      .map(p => {
        const topCard = [...(p.cards ?? [])].sort((a, b) => (b.pcMarket ?? 0) - (a.pcMarket ?? 0))[0];
        return { slug: p.slug, name: p.name, sport: p.sport, cardCount: p.cards.length, topCard };
      })
      .sort((a, b) => (b.topCard?.pcMarket ?? 0) - (a.topCard?.pcMarket ?? 0))
      .slice(0, limit);
    json(res, { total: withCards.length, items: withCards });
    return;
  }

  // GET /api/players/:slug/cards — all chase cards for a specific player
  const cardMatch = pathname.match(/^\/api\/players\/([^/]+)\/cards$/);
  if (req.method === 'GET' && cardMatch) {
    const slug = cardMatch[1];
    const all = getPlayersCache();
    const player = all.find(p => p.slug === slug || `${p.sport}_${p.slug}` === slug);
    if (!player) { cors(res); res.writeHead(404); res.end('Player not found'); return; }
    const cards = [...(player.cards ?? [])].sort((a, b) => (b.pcMarket ?? 0) - (a.pcMarket ?? 0));
    json(res, { slug: player.slug, name: player.name, sport: player.sport, cards });
    return;
  }

  // GET /api/players/stats — summary counts by sport
  if (req.method === 'GET' && pathname === '/api/players/stats') {
    const all = getPlayersCache();
    const stats = { total: all.length, named: 0, bySprot: {} };
    for (const p of all) {
      if (p.name) stats.named++;
      const s = p.sport ?? 'unknown';
      stats.bySprot[s] = (stats.bySprot[s] ?? 0) + 1;
    }
    json(res, stats);
    return;
  }

  cors(res);
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Fiddler Dashboard → http://localhost:${PORT}`);
});
