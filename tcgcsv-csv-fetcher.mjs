#!/usr/bin/env node
// tcgcsv individual-card + sealed price fetcher.
// Navigation (categories/groups) = JSON. Product DATA = ProductsAndPrices.csv (per group).
// CSV has quoted multi-line fields (extCardText) -> use a real RFC-4180 parser, never line.split.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const LOG = 'tcgcsv-csv-fetcher.log';
const BASE = 'https://tcgcsv.com/tcgplayer';
const TODAY = new Date().toISOString().split('T')[0];

// categoryId -> { name, db }  (DB lives LOCAL only, never committed)
const CATS = {
  3:  { name: 'Pokemon',              db: 'set-history.json' },
  1:  { name: 'Magic',                db: 'set-history-mtg.json' },
  68: { name: 'One Piece',            db: 'set-history-one-piece.json' },
  71: { name: 'Lorcana',              db: 'set-history-lorcana.json' },
  20: { name: 'Weiss Schwarz',        db: 'set-history-weiss.json' },
  81: { name: 'Union Arena',          db: 'set-history-union-arena.json' },
  86: { name: 'Gundam',               db: 'set-history-gundam.json' },
  2:  { name: 'Yu-Gi-Oh',             db: 'set-history-yugioh.json' },
  16: { name: 'Cardfight Vanguard',   db: 'set-history-cardfight.json' },
  27: { name: 'Dragon Ball Super',    db: 'set-history-dragon-ball.json' },
  62: { name: 'Flesh & Blood',        db: 'set-history-fab.json' },
  63: { name: 'Digimon',              db: 'set-history-digimon.json' },
  77: { name: 'Sorcery',              db: 'set-history-sorcery.json' },
  79: { name: 'Star Wars Unlimited',  db: 'set-history-star-wars.json' },
  80: { name: 'Dragon Ball FW',       db: 'set-history-dragon-ball.json' },
  87: { name: 'hololive',             db: 'set-history-hololive.json' },
};

// process order: Pokemon first, then Magic, then the rest (user directive)
const ORDER = (process.env.TCG_CATS ? process.env.TCG_CATS.split(',').map(Number) : [3, 1, 68, 71, 79, 86]);

const SEALED_RE = /(booster\s*box|booster\s*pack|elite\s*trainer|\betb\b|\bbox\b|\bpack\b|collection|bundle|display|\bcase\b|\bdeck\b|starter|tin|blister|premium\s*collection|build\s*&\s*battle|sleeved|fat\s*pack|gift\s*set|precon|commander\s*deck)/i;

function log(msg) { console.log(msg); appendFileSync(LOG, msg + '\n'); }

function fetchText(url) {
  try {
    return execSync(`curl -s "${url}" --max-time 30`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    log(`  [fetch-error] ${String(e.message).split('\n')[0].slice(0, 60)}`);
    return null;
  }
}

function fetchJson(url) {
  const t = fetchText(url);
  if (!t) return null;
  try { const j = JSON.parse(t); return j.success ? j.results : null; }
  catch { return null; }
}

// RFC-4180 CSV parser: handles quoted fields containing commas, quotes ("") and newlines.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const header = rows[0];
  return rows.slice(1).filter(r => r.length === header.length).map(r => {
    const o = {}; header.forEach((h, i) => { o[h] = r[i]; }); return o;
  });
}

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function main() {
  log(`\n[tcgcsv-csv-fetcher] ${new Date().toISOString()}  (CSV refresh 20:00 UTC daily)`);

  let grandSets = 0, grandCards = 0, grandSealed = 0;

  for (const catId of ORDER) {
    const cat = CATS[catId];
    if (!existsSync(cat.db)) { log(`[${cat.name}] DB missing: ${cat.db} (skip)`); continue; }

    const raw = JSON.parse(readFileSync(cat.db, 'utf8'));
    const nested = !!raw.sets;
    const sets = nested ? raw.sets : raw;

    // index existing sets by tcgId for fast groupId match
    const byTcgId = {};
    for (const [k, v] of Object.entries(sets)) if (v && v.tcgId != null) byTcgId[String(v.tcgId)] = k;

    log(`\n========== [${cat.name}] (cat ${catId}) ==========`);
    const groups = fetchJson(`${BASE}/${catId}/groups`);
    if (!groups) { log('  groups fetch failed'); continue; }
    log(`  ${groups.length} groups`);

    let catSets = 0, catCards = 0, catSealed = 0;

    for (const g of groups) {
      const gid = String(g.groupId);
      const csv = fetchText(`${BASE}/${catId}/${gid}/ProductsAndPrices.csv`);
      if (!csv) continue;
      const rows = parseCsv(csv);
      if (!rows.length) continue;

      const cards = [], sealed = [];
      for (const p of rows) {
        const mp = parseFloat(p.marketPrice);
        if (!p.productId || !p.name || !(mp > 0)) continue;
        const rec = {
          productId: p.productId,
          name: p.name.slice(0, 120),
          market: mp,
          low: parseFloat(p.lowPrice) || null,
          mid: parseFloat(p.midPrice) || null,
          high: parseFloat(p.highPrice) || null,
          rarity: p.extRarity || null,
          number: p.extNumber || null,
          priceHistory: [{ date: TODAY, price: mp, source: 'tcgcsv' }],
          fetchedAt: new Date().toISOString(),
        };
        if (SEALED_RE.test(p.name)) sealed.push(rec); else cards.push(rec);
      }
      if (!cards.length && !sealed.length) continue;

      // locate set: match existing by tcgId(groupId), else create
      let key = byTcgId[gid];
      if (!key) {
        key = slug(g.name);
        if (!sets[key]) sets[key] = { set_name: g.name, category: cat.name, tcgId: g.groupId };
        byTcgId[gid] = key;
      }
      const set = sets[key];
      set.tcgId = g.groupId;
      set.cards = set.cards || {};

      // merge cards: append today's priceHistory point per productId (no dup card rows)
      const existing = set.cards.fullCardList || [];
      const idx = {}; existing.forEach(c => { idx[c.productId] = c; });
      for (const c of cards) {
        const prev = idx[c.productId];
        if (prev) {
          prev.market = c.market; prev.low = c.low; prev.mid = c.mid; prev.high = c.high;
          prev.priceHistory = prev.priceHistory || [];
          if (!prev.priceHistory.some(h => h.date === TODAY)) prev.priceHistory.push(c.priceHistory[0]);
          prev.fetchedAt = c.fetchedAt;
        } else { existing.push(c); idx[c.productId] = c; }
      }
      set.cards.fullCardList = existing;
      set.cards.fetchedAt = new Date().toISOString();

      // sealed cascade -> set.products keyed by slug(name)
      if (sealed.length) {
        set.products = set.products || {};
        for (const s of sealed) {
          const pk = slug(s.name);
          const prev = set.products[pk];
          if (prev && prev.priceHistory) {
            prev.market = s.market;
            if (!prev.priceHistory.some(h => h.date === TODAY)) prev.priceHistory.push(s.priceHistory[0]);
          } else set.products[pk] = s;
        }
      }

      catSets++; catCards += cards.length; catSealed += sealed.length;
      const avg = cards.length ? (cards.reduce((a, c) => a + c.market, 0) / cards.length).toFixed(2) : '-';
      log(`    ${g.name.slice(0, 38).padEnd(38)} cards:${String(cards.length).padStart(4)} sealed:${String(sealed.length).padStart(2)} avg$${avg}`);
    }

    writeFileSync(cat.db, JSON.stringify(raw, null, 2));
    log(`  [${cat.name}] ${catSets} sets, ${catCards} cards, ${catSealed} sealed -> ${cat.db}`);
    grandSets += catSets; grandCards += catCards; grandSealed += catSealed;
  }

  log(`\n[COMPLETE] ${grandSets} sets | ${grandCards} cards | ${grandSealed} sealed | ${TODAY}`);
}

main();
