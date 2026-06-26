/**
 * resolve-retail.mjs — Structural enforcement of verified retail prices.
 *
 * RULE: prod.retail is NEVER trusted for ROI unless prod.retailVerified === true.
 * This module probes live sources in priority order and confirms via ≥2-source agreement.
 * For pre-release products with no live source, it extrapolates estimatedRetail from
 * same-publisher/format comp median — labeled clearly, never masquerading as MSRP.
 *
 * Probe priority:
 *   1. StockX catalog hit (retailPrice field) — most reliable, shown on product page
 *   2. TCGPlayer listing lowest price (only if product type = sealed, price < eBay median × 0.7)
 *   3. CoolStuffInc product search (LGS, usually at MSRP)
 *   4. TrollAndToad search (LGS, usually at MSRP)
 *
 * Agreement: ≥2 probes within 10% of median → retailVerified = true.
 * Single probe: retailVerified = false, flagged in embed.
 * Zero probes: fall through to estimatedRetail (extrapolation).
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadProxies() {
  try {
    return [
      ...readFileSync(join(ROOT,'ISP.txt'),'utf8').split('\n'),
      ...readFileSync(join(ROOT,'heroresi.txt'),'utf8').split('\n'),
    ].filter(l=>l.trim()).map(p=>{const [h,po,u,pa]=p.trim().split(':');return{host:h,port:po,user:u,pass:pa,url:`http://${u}:${pa}@${h}:${po}`};});
  } catch { return []; }
}
let _proxies = null, _pi = 0;
function nextProxy() {
  if (!_proxies) _proxies = loadProxies();
  if (!_proxies.length) return null;
  return _proxies[_pi++ % _proxies.length];
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function loadDB(file) {
  const p = join(ROOT, file);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

// ── Probe 1: StockX MSRP from already-fetched signals ────────────────────────
function probeStockXFromSignals(signals) {
  const msrp = signals?.stockx?.msrp;
  return msrp ? { price: msrp, source: `StockX MSRP (${signals.stockx.urlKey ?? 'stockx.com'})` } : null;
}

// ── Probe 2: TCGPlayer lowest sealed listing (below eBay median × 0.7) ────────
async function probeTCGPlayer(prod, ebayMedian) {
  if (!prod.tcgId) return null;
  try {
    const r = await fetch(`https://mp-search-api.tcgplayer.com/v2/product/${prod.tcgId}/details`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.tcgplayer.com/' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    // lowestPrice on a sealed product = lowest active listing.
    // Guard: must be < ebayMedian × 0.7 (otherwise it's secondary, not retail).
    //        must be > $5 (guard against pack listings bleeding in).
    const lowest = d.lowestPrice ?? null;
    const ceiling = ebayMedian ? ebayMedian * 0.7 : Infinity;
    if (lowest && lowest > 5 && lowest < ceiling) {
      return { price: lowest, source: `TCGPlayer lowest listing (product ${prod.tcgId})` };
    }
    return null;
  } catch { return null; }
}

// ── Probe 3: CoolStuffInc search ──────────────────────────────────────────────
async function probeCoolStuffInc(query) {
  try {
    const proxy = nextProxy();
    const launchOpts = proxy
      ? { headless: true, proxy: { server: `http://${proxy.host}:${proxy.port}`, username: proxy.user, password: proxy.pass } }
      : { headless: true };
    const browser = await chromium.launch(launchOpts);
    try {
      const ctx = await browser.newContext({ userAgent: UA });
      const page = await ctx.newPage();
      const url = `https://www.coolstuffinc.com/main_search.php?q=${encodeURIComponent(query)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);
      const results = await page.evaluate(() => {
        return [...document.querySelectorAll('.search-result-row, .product-item, [class*="product"], .main-col')].slice(0, 10).map(r => ({
          name:  (r.querySelector('.search-result-set-name, .product-name, h3, h4, a')?.textContent ?? '').trim().toLowerCase(),
          price: (r.querySelector('.sale-price, .our-price, .search-result-price, .price, [class*="price"]')?.textContent ?? '').trim(),
        })).filter(x => x.price && /\$/.test(x.price));
      });
      await browser.close();
      // Find best match — name must contain at least 2 words from query
      const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const match = results.find(r => qWords.filter(w => r.name.includes(w)).length >= 2);
      if (!match) return null;
      const price = parseFloat(match.price.replace(/[^0-9.]/g, ''));
      return (price > 5) ? { price, source: `CoolStuffInc — "${match.name.slice(0, 50)}"` } : null;
    } catch (e) { await browser.close().catch(() => {}); return null; }
  } catch { return null; }
}

// ── Probe 4: TrollAndToad Shopify JSON API ────────────────────────────────────
// T&T is on Shopify; /collections/{slug}/products.json returns live inventory w/ prices.
// Note: prices are selling price (near-MSRP for new sealed), not strict MSRP.
const TNT_SLUG_MAP = {
  pokemon:   ['pokemon'],
  mtg:       ['magic-the-gathering', 'magic'],
  lorcana:   ['lorcana', 'disney-lorcana'],
  one_piece: ['one-piece', 'one-piece-card-game'],
  topps:     ['sports-cards', 'baseball', 'basketball'],
};
async function probeTrollAndToad(query, category) {
  const proxy = nextProxy();
  const proxyArg = proxy ? `-x "${proxy.url}"` : '';
  const slugs = TNT_SLUG_MAP[category] ?? ['all'];
  const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  for (const slug of slugs) {
    try {
      const url = `https://www.trollandtoad.com/collections/${slug}/products.json?limit=50`;
      const raw = execSync(`curl -s ${proxyArg} -A "${UA}" -L --max-time 12 --connect-timeout 6 "${url}"`,
        { encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 18000 }) || '';
      if (!raw || raw.length < 50) continue;
      const d = JSON.parse(raw);
      const products = d.products ?? [];
      // Find best title match — at least 2 query words must appear in title
      const match = products.find(p => {
        const title = (p.title ?? '').toLowerCase();
        return qWords.filter(w => title.includes(w)).length >= Math.min(2, qWords.length);
      });
      if (!match) continue;
      const price = parseFloat(match.variants?.[0]?.price ?? '0');
      if (price > 5 && price !== 0) {
        return { price, source: `TrollAndToad — "${match.title?.slice(0,50)}"` };
      }
    } catch { continue; }
  }
  return null;
}

// ── Probe 5: One Piece official site (en.onepiece-cardgame.com) ───────────────
// Bandai publishes pack MSRP in static HTML; booster box = 24 × packPrice.
async function probeOnePieceOfficial(prod) {
  if (prod.category !== 'one_piece') return null;
  try {
    const proxy = nextProxy();
    const proxyArg = proxy ? `-x "${proxy.url}"` : '';
    const html = execSync(
      `curl -s ${proxyArg} -A "${UA}" -L --max-time 15 --connect-timeout 6 "https://en.onepiece-cardgame.com/products/?subcategory=boosters"`,
      { encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 20000 }
    ) || '';
    const prices = [...html.matchAll(/\$(\d+\.\d{2})/g)].map(m => parseFloat(m[1])).filter(p => p > 0 && p < 30);
    if (!prices.length) return null;
    // The booster pack page shows per-pack prices; most common = standard BB pack price
    const freq = {};
    prices.forEach(p => { freq[p] = (freq[p] ?? 0) + 1; });
    const packPrice = parseFloat(Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0]);
    const boxMsrp = Math.round(packPrice * 24 * 100) / 100; // 24 packs per OP BB
    return { price: boxMsrp, source: `One Piece official site (${packPrice}/pack × 24)` };
  } catch { return null; }
}

// ── Agreement check: ≥2 results within 10% of each other ─────────────────────
function findAgreement(probes) {
  if (probes.length < 2) return null;
  // Sort by price, find pair within 10%
  const sorted = [...probes].sort((a, b) => a.price - b.price);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (b.price <= a.price * 1.10) {
      const agreed = Math.round((a.price + b.price) / 2 * 100) / 100;
      return { price: agreed, sources: [a.source, b.source], verified: true };
    }
  }
  return null;
}

// ── #3: estimatedRetail from same-publisher/format comp median ────────────────
export function estimateRetailFromComps(prod) {
  const category = (prod.category ?? '').toLowerCase();
  const dbMap = {
    one_piece: 'set-history-one-piece.json',
    other_tcg: 'set-history-lorcana.json',
    topps:     'set-history-sports.json',
    mtg:       'set-history-mtg.json',
    lego:      'set-history-lego.json',
    noncard:   'set-history-noncard.json',
    pokemon:   null, // Pokemon uses internal PRODUCTS map, not a simple DB
  };
  const dbFile = dbMap[category];
  if (!dbFile) return null;
  const db = loadDB(dbFile);
  const sets = Object.values(db.sets ?? {});
  // Collect verified retail prices from sets of same product type
  const productType = /booster.box/i.test(prod.label ?? '') ? 'booster-box' : null;
  const verifiedPrices = sets
    .filter(s => s.retail && s.retail > 0)
    .map(s => {
      // Use set-level retail if it matches expected product type
      if (productType && s.products?.[productType]?.first) return s.products[productType].first;
      return s.retail;
    })
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (!verifiedPrices.length) return null;
  // Median
  const mid = Math.floor(verifiedPrices.length / 2);
  const median = verifiedPrices.length % 2 !== 0
    ? verifiedPrices[mid]
    : (verifiedPrices[mid - 1] + verifiedPrices[mid]) / 2;
  return {
    price: Math.round(median * 100) / 100,
    source: `estimated from ${verifiedPrices.length} same-format comp median (${category})`,
    verified: false,
  };
}

// ── Main export: resolveRetail ────────────────────────────────────────────────
/**
 * Resolve verified retail for a product.
 * Returns { retail, estimatedRetail, retailVerified, retailSource, retailSources }
 *
 * retail         = confirmed MSRP (only set when verified)
 * estimatedRetail = extrapolated from comps (pre-release fallback, never used as MSRP in ROI)
 * retailVerified = true only when ≥2 live sources agree within 10%
 */
export async function resolveRetail(prod, signals, opts = {}) {
  // Already verified and no re-probe needed
  if (prod.retailVerified === true && prod.retail) {
    return { retail: prod.retail, retailVerified: true, retailSource: prod.retailSource ?? 'pre-verified' };
  }

  const ebayMedian = signals?.ebay?.median ?? null;
  const query = prod.ebayQuery ?? prod.label ?? '';
  const probes = [];

  console.log(`  [resolve-retail] probing live sources for "${prod.label}"…`);

  // Run probes — StockX always first (fastest, most reliable MSRP display)
  const sx = probeStockXFromSignals(signals);
  if (sx) { probes.push(sx); console.log(`  [resolve-retail] StockX MSRP $${sx.price}`); }

  // TCGPlayer — only if tcgId known and eBay median exists for ceiling guard
  if (prod.tcgId && ebayMedian) {
    const tcg = await probeTCGPlayer(prod, ebayMedian);
    if (tcg) { probes.push(tcg); console.log(`  [resolve-retail] TCGPlayer $${tcg.price}`); }
  }

  // One Piece official — probe before LGS for OP products
  if (prod.category === 'one_piece') {
    const op = await probeOnePieceOfficial(prod);
    if (op) { probes.push(op); console.log(`  [resolve-retail] OP official $${op.price}`); }
  }

  // CoolStuffInc + TrollAndToad — only if we still need a 2nd source
  if (probes.length < 2 && !opts.skipLGS) {
    const [csi, tnt] = await Promise.all([
      probeCoolStuffInc(query),
      probeTrollAndToad(query, prod.category),
    ]);
    if (csi) { probes.push(csi); console.log(`  [resolve-retail] CoolStuffInc $${csi.price}`); }
    if (tnt) { probes.push(tnt); console.log(`  [resolve-retail] TrollAndToad $${tnt.price}`); }
  }

  // Check agreement
  if (probes.length >= 2) {
    const agreement = findAgreement(probes);
    if (agreement) {
      console.log(`  [resolve-retail] ✅ VERIFIED $${agreement.price} (${agreement.sources.join(' + ')})`);
      return {
        retail:          agreement.price,
        retailVerified:  true,
        retailSource:    agreement.sources[0],
        retailSources:   agreement.sources,
        estimatedRetail: null,
      };
    }
    // Probes found but disagree — single-source only, not verified
    console.log(`  [resolve-retail] ⚠️ probes disagree (${probes.map(p => `$${p.price}`).join(' vs ')}) — unverified`);
    const best = probes.sort((a, b) => a.price - b.price)[0];
    return {
      retail:          null,
      retailVerified:  false,
      retailSource:    best.source,
      retailSources:   probes.map(p => p.source),
      _unverifiedHint: best.price,  // available for embed note but NOT used in ROI
      estimatedRetail: estimateRetailFromComps(prod) ?? null,
    };
  }

  if (probes.length === 1) {
    console.log(`  [resolve-retail] ⚠️ single source $${probes[0].price} — not enough to verify`);
    return {
      retail:          null,
      retailVerified:  false,
      retailSource:    probes[0].source,
      _unverifiedHint: probes[0].price,
      estimatedRetail: estimateRetailFromComps(prod) ?? null,
    };
  }

  // Zero probes — fall through to estimatedRetail
  const est = estimateRetailFromComps(prod);
  if (est) {
    console.log(`  [resolve-retail] 📊 no live sources — estimatedRetail $${est.price} from ${est.source}`);
    return {
      retail:          null,
      retailVerified:  false,
      retailSource:    null,
      estimatedRetail: est,
    };
  }

  console.log(`  [resolve-retail] ❌ no retail data found — ROI will be null`);
  return { retail: null, retailVerified: false, retailSource: null, estimatedRetail: null };
}
