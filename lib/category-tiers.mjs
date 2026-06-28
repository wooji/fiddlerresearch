/**
 * Per-category tier scoring — mirrors Pokemon's tierOf(score) mechanic.
 * Each category uses metrics relevant to its own pricing dynamics.
 * Score 0-100 → S+/S/A/B/C/D tier, same as Pokemon.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadDB(file) {
  const p = join(ROOT, file);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

export function tierOf(score) {
  return score >= 91 ? 'S+' : score >= 81 ? 'S' : score >= 71 ? 'A' : score >= 61 ? 'B' : score >= 51 ? 'C' : 'No Send';
}

// ── Lorcana ───────────────────────────────────────────────────────────────────
// Mechanics: reprint risk is structural (every chapter reprinted <6mo).
// Score weights: ATH multiple (how high it spiked) 40% + current hold vs MSRP 30% + longevity 20% + reprint survival 10%
// Products: booster-box ($120 MSRP), blister ($6 MSRP)
const LORCANA_RETAIL = { 'booster-box': 120, 'blister': 6, 'booster-pack': 6, 'illumineers-trove': 30 };
const LORCANA_REPRINTED = new Set(['lorcana-first-chapter','lorcana-rise-of-the-floodborn','lorcana-into-the-inklands','lorcana-ursulas-return','lorcana-shimmering-skies','lorcana-azurite-sea','lorcana-archazias-island']);

export function lorcanaSetScore(setKey, productType = 'booster-box') {
  const db   = loadDB('set-history-lorcana.json');
  const sets = db.sets ?? {};
  const set  = sets[setKey];
  if (!set) return null;
  const prod = set.products?.[productType] ?? set.products?.[Object.keys(set.products ?? {})[0]];
  if (!prod) return null;

  const retail  = LORCANA_RETAIL[productType] ?? 120;
  const athMult = prod.ath  ? prod.ath  / retail : 1;
  const curMult = prod.current ? prod.current / retail : 1;
  const months  = prod.months ?? 1;
  const reprinted = LORCANA_REPRINTED.has(setKey);

  // ATH multiple: cap at 5× (Fabled ~7× outlier)
  const athScore  = Math.min(Math.max((athMult - 1) / 4, 0), 1) * 100;  // 0=1×, 100=5×
  const curScore  = Math.min(Math.max((curMult - 0.8) / 2.2, 0), 1) * 100; // 0=below retail, 100=3×
  const ageMult   = Math.min(months / 24, 1); // mature after 2yr
  const longevity = curMult >= 1.0 ? ageMult * 100 : ageMult * 40; // punish sets below retail
  const reprintPenalty = reprinted ? -10 : 0; // reprinted = structurally capped

  const score = Math.round(athScore * 0.40 + curScore * 0.30 + longevity * 0.20 + reprintPenalty + 10);
  return { score: Math.max(0, Math.min(100, score)), athMult: +athMult.toFixed(1), curMult: +curMult.toFixed(1), months };
}

// ── Sports (Topps/Panini/Bowman) ──────────────────────────────────────────────
// Mechanics: Hobby = fixed print, appreciates with strong RC. Blaster = restock, no hold.
// Score weights: ATH multiple 35% + current hold 35% + product tier 20% + RC strength (proxy: ATH reached) 10%
const SPORTS_RETAIL = { 'hobby-box': 200, 'blaster-box': 22, 'mega-box': 30, 'jumbo-box': 250, 'hanger-pack': 10 };

export function sportsSetScore(setKey, productType = 'hobby-box') {
  const db   = loadDB('set-history-sports.json');
  const sets = db.sets ?? {};
  const set  = sets[setKey];
  if (!set) return null;
  const prod = set.products?.[productType] ?? set.products?.[Object.keys(set.products ?? {})[0]];
  if (!prod) return null;

  const retail   = SPORTS_RETAIL[productType] ?? prod.first ?? 200;
  const athMult  = prod.ath     ? prod.ath  / retail : 1;
  const curMult  = prod.current ? prod.current / retail : 1;
  const months   = prod.months ?? 1;
  const isHobby  = /hobby/.test(productType);

  const athScore  = Math.min(Math.max((athMult - 1) / 0.8, 0), 1) * 100; // 0=1×, 100=1.8×
  const curScore  = Math.min(Math.max((curMult - 0.9) / 0.9, 0), 1) * 100;
  const tierBonus = isHobby ? 15 : -10; // hobby holds, blaster bleeds
  const rcProxy   = athMult >= 1.5 ? 10 : athMult >= 1.3 ? 5 : 0; // strong RC reached ATH

  const score = Math.round(athScore * 0.35 + curScore * 0.35 + tierBonus + rcProxy);
  return { score: Math.max(0, Math.min(100, score)), athMult: +athMult.toFixed(1), curMult: +curMult.toFixed(1), months };
}

// ── MTG ───────────────────────────────────────────────────────────────────────
// Mechanics: Collector Box > Play Box > Secret Lair. IP crossover spikes 2-4×.
// Score weights: ATH multiple 40% + current hold 25% + IP strength (ATH >2× = strong IP) 25% + months 10%
const MTG_RETAIL = { 'collector-booster-box': 324, 'play-booster-box': 210, 'bundle': 70, 'secret-lair': 40, 'commander-deck': 50 };

export function mtgSetScore(setKey, productType = 'collector-booster-box') {
  const db   = loadDB('set-history-mtg.json');
  const sets = db.sets ?? {};
  const set  = sets[setKey];
  if (!set) return null;
  const prod = set.products?.[productType] ?? set.products?.[Object.keys(set.products ?? {})[0]];
  if (!prod) return null;

  const retail  = MTG_RETAIL[productType] ?? prod.first ?? 324;
  const athMult = prod.ath     ? prod.ath  / retail : 1;
  const curMult = prod.current ? prod.current / retail : 1;
  const months  = prod.months ?? 1;

  // MTG caps: collector box rarely exceeds 3× except crossover IP
  const athScore  = Math.min(Math.max((athMult - 0.8) / 2.2, 0), 1) * 100;
  const curScore  = Math.min(Math.max((curMult - 0.6) / 1.4, 0), 1) * 100;
  const ipScore   = athMult >= 2.5 ? 100 : athMult >= 1.5 ? 60 : athMult >= 1.0 ? 30 : 0;
  const ageMult   = Math.min(months / 18, 1);

  const score = Math.round(athScore * 0.40 + curScore * 0.25 + ipScore * 0.25 + ageMult * 10);
  return { score: Math.max(0, Math.min(100, score)), athMult: +athMult.toFixed(1), curMult: +curMult.toFixed(1), months };
}

// ── LEGO ──────────────────────────────────────────────────────────────────────
// Mechanics: appreciates ONLY post-EOL/retirement. Active sets at/below retail.
// Score weights: ATH multiple 35% + current hold 35% + retirement status 20% + months 10%
const LEGO_RETAIL_DEFAULT = 100;

export function legoSetScore(setKey) {
  const db   = loadDB('set-history-lego.json');
  const sets = db.sets ?? {};
  // BrickEconomy backfill stores by set number (e.g. "77092"), product keys use full slug.
  // Prefer the entry that has products (BrickEconomy data); fiddler-appended entries lack products.
  const numericKey = (setKey.match(/(\d{4,6})(?:-\d+)?$/) ?? [])[1];
  const slugEntry  = sets[setKey];
  const numEntry   = numericKey ? sets[numericKey] : null;
  // Prefer entry with historical pricing data (ath/current from BrickEconomy backfill)
  const hasData = e => e && (e.ath != null || e.products);
  const set = (hasData(slugEntry) ? slugEntry : null) ?? (hasData(numEntry) ? numEntry : null) ?? slugEntry ?? numEntry;
  if (!set) return null;
  // BrickEconomy backfill = flat structure (set.current, set.ath, set.retail directly)
  // Fiddler product entries = nested products.sealed. Support both.
  const prod = set.products?.['sealed'] ?? set.products?.[Object.keys(set.products ?? {})[0]] ?? set;
  if (!prod) return null;

  const retail   = set.retail ?? prod.retail ?? LEGO_RETAIL_DEFAULT;
  const athMult  = (prod.ath ?? set.ath)           ? (prod.ath ?? set.ath)     / retail : 1;
  const curMult  = (prod.current ?? set.current)   ? (prod.current ?? set.current) / retail : 1;
  const months   = prod.productionMonths ?? set.productionMonths ?? prod.months ?? 1;
  const retired  = set.retired === true || set.eol != null || set.retiredOn != null || set.retireExact != null || /retired|retiring|eol/i.test(set.status ?? '');

  const athScore   = Math.min(Math.max((athMult - 1) / 3, 0), 1) * 100; // 0=1×, 100=4×
  const curScore   = Math.min(Math.max((curMult - 0.9) / 2.1, 0), 1) * 100;
  const retireBonus = retired ? 20 : -15; // active = below retail risk
  const ageMult    = Math.min(months / 36, 1); // LEGO matures over 3yr

  const score = Math.round(athScore * 0.35 + curScore * 0.35 + retireBonus + ageMult * 10);
  return { score: Math.max(0, Math.min(100, score)), athMult: +athMult.toFixed(1), curMult: +curMult.toFixed(1), months, retired };
}

// ── Non-card / Vinyl ──────────────────────────────────────────────────────────
// Mechanics: IP-driven. No structural scarcity unless OOP. ATH and hold are primary signals.
// Score weights: ATH multiple 45% + current hold 40% + months 15%

export function noncardSetScore(setKey) {
  const db   = loadDB('set-history-noncard.json');
  const sets = db.sets ?? {};
  const set  = sets[setKey];
  if (!set) return null;
  const prod = set.products?.[Object.keys(set.products ?? {})[0]];
  if (!prod) return null;

  const retail  = set.retail ?? prod.first ?? 30;
  const athMult = prod.ath     ? prod.ath  / retail : 1;
  const curMult = prod.current ? prod.current / retail : 1;
  const months  = prod.months ?? 1;

  const athScore = Math.min(Math.max((athMult - 1) / 4, 0), 1) * 100;
  const curScore = Math.min(Math.max((curMult - 0.8) / 2.2, 0), 1) * 100;
  const ageMult  = Math.min(months / 24, 1);

  const score = Math.round(athScore * 0.45 + curScore * 0.40 + ageMult * 15);
  return { score: Math.max(0, Math.min(100, score)), athMult: +athMult.toFixed(1), curMult: +curMult.toFixed(1), months };
}

// ── One Piece TCG ─────────────────────────────────────────────────────────────
// Mechanics: Bandai does ~1 reprint wave per set (3-6mo post-release). More stable than Lorcana.
// Strong IP sets (Shanks/Roger/Luffy S-tier) sustain 4-7×. Weaker sets revert to 1.2-1.5×.
// Score weights: ATH multiple 40% + current hold 35% + IP strength (ATH proxy) 15% + months 10%
const ONEPIECE_RETAIL = { 'booster-box': 120 };

export function onepieceTCGSetScore(setKey, productType = 'booster-box') {
  const db   = loadDB('set-history-one-piece.json');
  const sets = db.sets ?? {};
  const set  = sets[setKey];
  if (!set) return null;
  const prod = set.products?.[productType] ?? set.products?.[Object.keys(set.products ?? {})[0]];
  if (!prod) return null;

  const retail  = set.retail ?? ONEPIECE_RETAIL[productType] ?? 72;
  const athMult = prod.ath     ? prod.ath  / retail : 1;
  const curMult = prod.current ? prod.current / retail : 1;
  const months  = prod.months ?? 1;

  // ATH scale: 0=1×, 100=4×. OP08's 7.2× is an outlier; 4× already earns S-tier.
  // curScore: 0=below retail, 100=4×. New set (3mo) still at 4× = strong demonstrated demand.
  const athScore = Math.min(Math.max((athMult - 1) / 3, 0), 1) * 100; // 0=1×, 100=4×
  const curScore = Math.min(Math.max((curMult - 0.9) / 3.1, 0), 1) * 100; // 0=retail, 100=4×
  const ipScore  = athMult >= 4 ? 100 : athMult >= 3 ? 75 : athMult >= 2 ? 45 : 10;
  const ageMult  = Math.min(months / 18, 1);

  const score = Math.round(athScore * 0.40 + curScore * 0.35 + ipScore * 0.15 + ageMult * 10);
  return { score: Math.max(0, Math.min(100, score)), athMult: +athMult.toFixed(1), curMult: +curMult.toFixed(1), months };
}

// ── Dispatcher — resolves correct scorer by category ─────────────────────────
export function categorySetScore(prod, productType) {
  const cat = (prod.category ?? '').toLowerCase();
  const key = prod._dbKey ?? prod.set?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? '';

  if (cat === 'one_piece' || /one.piece|op-?\d{2}/i.test(prod.label ?? ''))
    return onepieceTCGSetScore(key, productType);
  if (cat === 'other_tcg' || /lorcana|disney lorcana/i.test(prod.label ?? ''))
    return lorcanaSetScore(key, productType);
  if (cat === 'topps' || /topps|panini|bowman/i.test(prod.label ?? ''))
    return sportsSetScore(key, productType);
  if (cat === 'mtg' || /magic|secret lair/i.test(prod.label ?? ''))
    return mtgSetScore(key, productType);
  if (cat === 'lego' || /\blego\b/i.test(prod.label ?? ''))
    return legoSetScore(key);
  if (cat === 'noncard' || cat === 'vinyl')
    return noncardSetScore(key);
  return null;
}
