// PriceCharting sealed-product history scraper (FREE — public product pages).
// Each /game/pokemon-{set}/{product} page embeds `chart_data = {...}` where the
// "used" series = the SEALED price history in CENTS: [[epochMillis, cents], ...].
// Covers every set/era; depth = as far back as PriceCharting tracked the item.
import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const SEALED_TYPES = ['booster-box', 'elite-trainer-box', 'booster-bundle', 'booster-pack'];

// Enumerate every Pokemon set console slug from the category index.
export async function pcConsoleList() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('https://www.pricecharting.com/category/pokemon-cards', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    const sets = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href*="/console/pokemon"]')]
        .map(a => a.getAttribute('href'))
        .filter(h => h && /^\/console\/pokemon-/.test(h) && !h.includes('?') && !/\/(de|es|fr|it|ja)\//.test(h)))]
        .map(h => ({ slug: h.replace('/console/', ''), name: h.replace('/console/pokemon-', '').replace(/-/g, ' ') }))
    );
    await browser.close();
    return sets;
  } catch { try { await browser.close(); } catch {} return []; }
}

// Generic enumerator: scrape /console/* slugs from any category index page.
// filterRe limits to the franchise; nameStrip trims the slug → display name.
export async function pcConsoleListBy(categorySlug, filterRe, nameStrip) {
  const reSrc = filterRe.source, reFlags = filterRe.flags;
  // Retry on empty — concurrent scrapes can trip PriceCharting rate-limiting (403/429),
  // which surfaces as a 0-slug page. Back off and retry before giving up.
  for (let attempt = 1; attempt <= 4; attempt++) {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
      const page = await ctx.newPage();
      const resp = await page.goto(`https://www.pricecharting.com/category/${categorySlug}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(1500);
      const status = resp ? resp.status() : 0;
      const slugs = await page.evaluate(({ reSrc, reFlags }) => {
        const re = new RegExp(reSrc, reFlags);
        return [...new Set([...document.querySelectorAll('a[href^="/console/"]')]
          .map(a => a.getAttribute('href'))
          .filter(h => h && !h.includes('?'))
          .map(h => h.replace('/console/', ''))
          .filter(s => re.test(s)))];
      }, { reSrc, reFlags });
      await browser.close();
      if (slugs.length) return slugs.map(s => ({ slug: s, name: (nameStrip ? s.replace(nameStrip, '') : s).replace(/-/g, ' ').trim() }));
      console.error(`  [pcConsoleListBy] ${categorySlug} empty (status ${status}), attempt ${attempt}/4 — backing off`);
    } catch (e) { try { await browser.close(); } catch {} console.error(`  [pcConsoleListBy] ${categorySlug} err ${e?.message}, attempt ${attempt}/4`); }
    await new Promise(r => setTimeout(r, attempt * 8000));
  }
  return [];
}

// Sealed-format type slugs per DB family (PriceCharting URL segments).
// Per fiddler-analysis-handbook.txt product ranges — COMPREHENSIVE ALL TYPES
export const SEALED_TYPES_BY = {
  pokemon: [
    // Base formats
    'booster-box', 'elite-trainer-box', 'booster-bundle', 'booster-pack',
    // Tins (handbook: Display Tin Set 10 & 8 count)
    'display-tin-set-10-count', 'display-tin-set-8-count', 'tin-set-10-count', 'tin-set-8-count', 'tin',
    // Collections & Premium (handbook: Collection Boxes + premium variants)
    'collection-box', 'collection-boxes', 'premium-collection', 'ultra-premium-collection', 'super-premium-collection', 'deluxe-collection',
    // Blisters (handbook: 3-pack, 2-pack, single)
    '3-pack-blister', '2-pack-blister', 'blister-pack', 'booster-blister'
  ],
  mtg: [
    // Booster boxes (handbook: Collector, Gift, Play)
    'collector-booster-box', 'set-booster-box', 'draft-booster-box', 'play-booster-box',
    // Bundles & Gift (handbook: Gift Bundles)
    'gift-bundle', 'bundle', 'gift-box',
    // Packs (handbook: Single Collector Packs, Single Packs)
    'collector-booster-pack', 'booster-pack', 'starter-pack',
    // Other (handbook: Play Boxes fallback)
    'fat-pack', 'starter-box', 'play-box'
  ],
  lorcana: [
    // Booster (handbook: Booster Display Boxes, Booster Packs)
    'booster-box', 'booster-pack',
    // Sleeved (handbook: Sleeved Boosters)
    'sleeved-booster', 'sleeved-boosters',
    // Premium (handbook: Collectors Illumineer's Trove)
    'illumineer-trove', 'collectors-illumineer-trove',
    // Starters (handbook: Collection Starter Sets)
    'starter-deck', 'collection-starter-set', 'collection-starter-box',
    // Gift (handbook: Gift Sets & Gift Boxes, Disney Collector Sets)
    'gift-set', 'gift-box', 'gift-bundle', 'disney-collector-set', 'disney-gift-set'
  ],
  'one-piece': [
    // Handbook: Booster Box, Double Box, Collection Sets
    'booster-box', 'double-box', 'collection-box', 'collection-set',
    'collection-sets', 'premium-collection', 'starter-deck'
  ],
  'other-tcg': [
    'booster-box', 'booster-pack', 'starter-deck', 'starter-box', 'display-box', 'collection-box',
    'jumbo-box', 'deluxe-collection', 'premium-collection'
  ],
  topps: [
    // Retail (handbook: Mega Box, Blaster/Value Box, Hanger Box, Fat Packs)
    'mega-box', 'blaster-box', 'hanger-box', 'fat-pack', 'value-box', 'retail-box', 'retail-value-box',
    // Topps Exclusive (handbook: Jumbo, Jumbo Hobby, Hobby, Sealed Cases, Special High-End)
    'jumbo-box', 'jumbo-hobby-box', 'hobby-box', 'hobby-box-case',
    'jumbo-case', 'jumbo-hobby-case', 'sealed-jumbo-case', 'sealed-jumbo-hobby-case', 'sealed-hobby-case',
    'special-edition', 'premium-box', 'ultra-premium-box'
  ],
  sports: [
    // Handbook: detailed per sport/brand (Topps, Panini, etc.)
    'hobby-box', 'blaster-box', 'hanger-box', 'mega-box', 'jumbo-box', 'retail-box',
    'booster-box', 'cello-box', 'fat-pack', 'value-box', 'retail-value-box',
    'retail-mega-box', 'blaster-mega-box', 'premium-box', 'deluxe-box'
  ],
  mattel: [
    // Handbook: Barbie, Monster High, RLC / Hot Wheels
    'barbie-collector-edition', 'barbie-dolls', 'barbie-collector-set',
    'monster-high-dolls', 'monster-high-collector-edition',
    'hot-wheels-rlc', 'hot-wheels-premium', 'hot-wheels-collector-edition', 'hot-wheels-collector-set'
  ],
};

// Parametric all-sealed: same as pcAllSealed but with a caller-supplied type list.
export async function pcAllSealedTypes(setSlug, types, browser) {
  const out = [];
  for (const t of types) {
    const r = await pcSealed(setSlug, t, browser);
    if (r) out.push(r);
    await new Promise(res => setTimeout(res, 1200));
  }
  return out;
}

// Parse one sealed product page → history from chart_data.used (cents → dollars).
export async function pcSealed(setSlug, type, browser) {
  const ownBrowser = !browser;
  if (ownBrowser) browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    const url = `https://www.pricecharting.com/game/${setSlug}/${type}`;
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null);
    await page.waitForTimeout(800);
    const ok = resp && resp.status() === 200;
    const raw = ok ? await page.evaluate(() => {
      const s = [...document.querySelectorAll('script')].map(x => x.textContent).join('\n');
      const m = s.match(/chart_data\s*=\s*(\{.*?\});/s);
      const isList = !!document.querySelector('table#games_table, .product-list') && !document.querySelector('#price_data');
      return { chart: m ? m[1] : null, isList };
    }) : { chart: null, isList: false };
    await ctx.close();
    if (ownBrowser) await browser.close();
    if (!ok || !raw.chart || raw.isList) return null;
    let obj; try { obj = JSON.parse(raw.chart); } catch { return null; }
    const used = (obj.used ?? []).filter(p => p[1] > 0).map(p => ({ m: new Date(p[0]).toISOString().slice(0, 7), price: +(p[1] / 100).toFixed(2) }));
    if (!used.length) return null;
    const prices = used.map(u => u.price);
    const athPt = used.reduce((a, u) => u.price > a.price ? u : a, used[0]);
    return {
      type, url,
      current: used.at(-1).price,
      currentMonth: used.at(-1).m,
      ath: athPt.price,
      athMonth: athPt.m,
      first: used[0].price,
      firstMonth: used[0].m,
      points: used.length,
      series: used,
    };
  } catch { if (ownBrowser) { try { await browser.close(); } catch {} } return null; }
}

// Best sealed comp for a set: try each sealed type, return first with real data.
export async function pcSetSealed(setSlug, browser) {
  for (const t of SEALED_TYPES) {
    const r = await pcSealed(setSlug, t, browser);
    if (r) return r;
  }
  return null;
}

// ALL sealed types for a set (booster-box, ETB, bundle, pack) that have history.
export async function pcAllSealed(setSlug, browser) {
  const out = [];
  for (const t of SEALED_TYPES) {
    const r = await pcSealed(setSlug, t, browser);
    if (r) out.push(r);
    await new Promise(res => setTimeout(res, 1200)); // polite — PriceCharting rate-throttles
  }
  return out;
}
