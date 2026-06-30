/**
 * Fiddler Research Pipeline
 * Usage: node fiddler-research.mjs <product-key>
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { tcgPrice, tcgProductSearch } from './lib/prices.mjs';
import { deepResearch, computeRisk, computeRating, checklistSignal, feedIntelSignal, ebaySold } from './lib/deep-research.mjs';
import { resolveSetIntel, buildIpLine } from './lib/set-intel.mjs';
import { buildQueryVariants } from './lib/query-builder.mjs';
import { categorySetScore, tierOf as categoryTierOf } from './lib/category-tiers.mjs';
import { resolveRetail as _resolveRetail, estimateRetailFromComps } from './lib/resolve-retail.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const env  = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const webhookArg   = process.argv.find(a => a.startsWith('--webhook='));
const WEBHOOK      = webhookArg ? webhookArg.split('=').slice(1).join('=') : env.EXTERNAL_WEBHOOK_URL;
if (!WEBHOOK) throw new Error('EXTERNAL_WEBHOOK_URL missing in .env');
const channelArg   = process.argv.find(a => a.startsWith('--channel='));
const CHANNEL_ID   = channelArg ? channelArg.split('=')[1] : null;

const COLORS = { DBLGREEN: 3066993, GREEN: 5763719, ORANGE: 15105570, YELLOW: 16766720, PURPLE: 10181046, RED: 15548997 };
const cdn    = id => `https://product-images.tcgplayer.com/fit-in/437x437/${id}.jpg`;
const ebay   = q  => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc`;
const fmt$   = n  => n != null ? `\`$${Number(n).toFixed(2)}\`` : '`N/A`';

const RATING_EMOJI = { DBLGREEN: '🟢🟢', GREEN: '🟢', ORANGE: '🟠', YELLOW: '🟡', PURPLE: '🟣', RED: '🔴' };

// ── Docs context reader — pulls category-specific rules from CATEGORY-MECHANICS.md ──
function readDocsContext(category) {
  const sections = {};
  const files = [
    { key: 'category', path: join(ROOT, 'CATEGORY-MECHANICS.md') },
    { key: 'pricing',  path: join(ROOT, 'PRICING-MECHANICS.md')  },
    { key: 'rating',   path: join(ROOT, 'RATING-LOGIC.md')       },
  ];
  for (const { key, path } of files) {
    if (!existsSync(path)) continue;
    try {
      const text = readFileSync(path, 'utf8');
      sections[key] = text.slice(0, 4000); // cap to avoid bloat
    } catch { /* ignore */ }
  }

  // Extract the section for this category from CATEGORY-MECHANICS.md
  if (sections.category && category) {
    const cat = category.toLowerCase().replace(/_/g, ' ');
    // Match ## or ### heading containing the category name, grab up to the next same-level heading
    const rx = new RegExp(`(#{2,3}\\s+[^\\n]*${cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*)\\n([\\s\\S]*?)(?=\\n#{2,3}\\s|$)`, 'i');
    const m = sections.category.match(rx);
    sections.categorySection = m ? (m[1] + '\n' + m[2]).slice(0, 1500) : null;
  }
  return sections;
}

// ── Product definitions (static map + dynamic sidecar) ────────────────────────
const _dynamicPath = join(ROOT, 'dynamic-products.json');
const _dynamic = existsSync(_dynamicPath) ? JSON.parse(readFileSync(_dynamicPath, 'utf8')) : {};
const PRODUCTS = { ..._dynamic, ...{
  'pitch-black-pc-etb': {
    label:      'Pokémon TCG: ME05 Pitch Black Pokémon Center Elite Trainer Box',
    category:   'pokemon',
    set:        'Pitch Black',
    retail:     59.99,
    retailNote: 'Pokemon Center (exclusive)',
    releaseDate: '2026-07-17',
    releaseUrl: 'https://www.tcgplayer.com/product/692949',
    preRelease:  true,
    forceRating: 'DBLGREEN',
    forceRisk:   '🟢 Low — Sold out at launch, eBay presales ~$200 vs $60 retail. Limited Pokemon Center allocation, no restock expected.',
    tcgId:       692949,
    ebayQuery:   'Pokemon Pitch Black Pokemon Center Elite Trainer Box sealed',
    contents:    '11 booster packs + Zarude stamped promo card (PC exclusive) + accessories | Limited Pokemon Center allocation',
    sellThrough: {
      flip:   { range: '$170 – $230', units: '~50 – 100 units (launch window; presale already $200)' },
      hold:   { range: '$300 – $450', units: '~25 – 50 units (3-6mo; ME04 PC ETB $999)' },
      invest: { range: '$450+',       units: '~10 – 25 units (12mo+, if ME series appreciation holds)' },
    },
    bulkBuy:   '50+ units',
    risk:      '🟢 Low',
    ebayFee:   0.13,
    evidence: [
      { source: 'YouTube: Ross (PC ETB sold out video)', date: '2026-06-30', point: 'PC ETB sold out at Pokemon Center launch. eBay presales $135-200 (US) vs $60 retail. "Largely unavailable" post-launch. No restock expected.' },
      { source: 'TCGCSV (verified)', date: '2026-06-30', point: 'PC ETB TCGPlayer market $520 (ask-side, pre-release). TCGId 692949 confirmed.' },
      { source: 'Sibling comps', date: '2026-06-30', point: 'ME04 PC ETB: $999 | ME: AH PC ETB: $490 | ME03 PC ETB: $133. Pitch Black PC ETB base case $300-450.' },
    ],
    scenarios: [
      { label: 'Bear', prob: 15, text: 'Darkrai IP underperforms; PC ETB demand stays near eBay presale levels. Settles $140-180 (ME03 PC ETB trajectory: $133).' },
      { label: 'Base', prob: 55, text: 'Strong flip window: presale $200 → launch settles $220-280. Hold to $350-450 in 3mo. ME: AH PC ETB ($490) is the base case comp.' },
      { label: 'Bull', prob: 30, text: 'Akira Agawa Mega Darkrai card goes viral post-release → retroactive demand surge. PC ETB $600-900+ in 6mo. ME04 PC ETB ($999) is achievable if set resonates.' },
    ],
    writeup: {
      market:      '• **Thesis — DBLGREEN: Pokemon Center exclusive, sold out at launch, 3× retail on presale.** PC ETBs at launch: sold out within hours per YouTube (Ross). eBay presales: $165-200 vs $60 retail = immediate 2.7-3.3× flip. TCGPlayer market $520 (ask-heavy, pre-release). No Pokemon Center restock expected (consistent with ME series pattern).\n• **Comp: ME04 PC ETB $999 | ME: AH PC ETB $490 | ME03 PC ETB $133.** Pitch Black PC ETB sits between ME03 (weak, no chase) and ME04 (Charizard). Akira Agawa Mega Darkrai SIR anchors demand above ME03 floor. Base target: $350-450 by October.\n• **Liquidity:** PC ETBs sell through immediately — both because of the stamped Zarude promo and because they cannot be restocked. Buy window = retail only (closed). Any allocation you have is at 3× retail minimum.',
      product:     '• **Contents:** 11 packs (2 more than regular) + Zarude stamped promo (PC-exclusive logo stamp) + accessories\n• **Packaging:** Different from regular ETB (slightly different box art per YouTube)\n• **What makes it special:** Pokemon Center stamp on promo = collector premium; strictly limited allocation; no restock path\n• **Promo card:** Zarude (regular ETB has unstamped Zarude; PC version has PC-logo stamped version)\n• **Set context:** ME05 Pitch Black — Mega Darkrai focused, Akira Agawa SIR, Morpeko SIR, Hyperspace Luminose theme from Pokemon Legends ZA DLC',
      priceComp:   '• ME04: Chaos Rising PC ETB: $999 (current market) — had Charizard\n• ME: Ascended Heroes PC ETB: $490 (current market)\n• ME03: Perfect Order PC ETB: $133 (weak, no top chase)\n• Pitch Black PC ETB presale: $165-200 eBay (US) | $520 TCGPlayer asks\n• Base case exit: $300-450 by 3 months post-release (October 2026)',
      supplyDemand:'• **Supply:** Sold out at Pokemon Center, no restock expected. Fixed supply — every unit is permanently scarce. Secondary market is the only source post-launch.\n• **Demand:** PC ETB demand proven by immediate sellout. Stamped promo appeals to sealed collectors and promo completionists. ME series has consistent PC ETB demand ($133-999 across 4 sets).',
      recs:        '• **If you have retail allocation:** DBLGREEN hold for 3-6mo ($350-450 target). Flip presale is profitable but you sacrifice the $300+ upside.\n• **If buying secondary:** eBay presale ~$200 = still profitable at base case ($350-450). Don\'t overpay above $250 for flip; hold thesis only above $250.\n• **Priority:** PC ETB > regular ETB on any given unit budget. PC ETB fixed supply; regular ETB may reprint within ME series reprint windows.',
    },
  },
  'pitch-black-etb': {
    label:      'Pokémon TCG: ME05 Pitch Black Elite Trainer Box',
    category:   'pokemon',
    set:        'Pitch Black',
    retail:     59.99,
    retailNote: 'Target / Walmart',
    releaseDate: '2026-07-17',
    releaseUrl: 'https://www.tcgplayer.com/product/692947',
    preRelease:  true,
    forceRating: 'GREEN',
    forceRisk:   '🟡 Medium — Darkrai IP polarizes community; but PC ETB sold out fast + Akira Agawa SIR = legitimate chase anchor',
    tcgId:       692947,
    ebayQuery:   'Pokemon Pitch Black Elite Trainer Box sealed',
    contents:    '9 booster packs + accessories | Zarude promo | Dark/gothic theme tied to Pokemon Legends ZA Mega Dimension DLC',
    pcExclusive: { label: 'PC Exclusive ETB', tcgId: 692949, note: 'Zarude stamped promo, 2 extra packs. Sold out at launch, eBay presales ~$200 vs $60 retail. TCGPlayer market $520 (ask-side). DBLGREEN target.' },
    sellThrough: {
      flip:   { range: '$130 – $180', units: '~100 – 200 units (launch window)' },
      hold:   { range: '$180 – $250', units: '~50 – 100 units (3-6mo)' },
      invest: { range: '$250+',       units: '~25 – 50 units (12mo+, if Akira Agawa SIR drives chase demand)' },
    },
    bulkBuy:   '100+ units',
    risk:      '🟡 Medium',
    ebayFee:   0.13,
    evidence: [
      { source: 'TCGCSV (verified)', date: '2026-06-30', point: 'Regular ETB TCGPlayer market $159.95 (presale), PC ETB $520. 23 sealed products in set. Releases 2026-07-17.' },
      { source: 'YouTube: Ross (PC ETB sold out video)', date: '2026-06-30', point: 'PC Pitch Black ETBs sold out at Pokemon Center launch. eBay presales ~$200 vs $60 retail = 3.3× before release. Tight allocation confirmed. Creator: "not cheap, far from retail."' },
      { source: 'YouTube: Phil (investment guide)', date: '2026-06-30', point: 'Mega Darkrai SIR by Akira Agawa (drew Crown Zenith gold VSTARs) = primary chase. Morpeko SIR unique gothic graffiti art. Creator: "Lost Origin vibes — started cold, ran hard." Tight allocation per separate allocation video.' },
    ],
    scenarios: [
      { label: 'Bear', prob: 20, text: 'Darkrai IP underperforms — community stays cold. Allocation eases post-launch. ETB settles $90-110 (ME03: Perfect Order trajectory at $71).' },
      { label: 'Base', prob: 55, text: 'Akira Agawa Mega Darkrai SIR drives chase demand post-release. ETB $160-220 at launch, holds $180 floor 3mo (between ME03 $71 and ME04 $355). PC ETB $250-350.' },
      { label: 'Bull', prob: 25, text: 'Lost Origin pattern: cold launch → Akira Agawa card goes viral → retroactive demand. ETB $250-300, PC ETB $400-500 within 6mo. ME04 Chaos Rising comp ($355 ETB) if Darkrai resonates post-play.' },
    ],
    writeup: {
      market:      '• **Thesis — GREEN: Legitimate chase anchor + PC ETB sold out = controlled risk.** Mega Darkrai SIR by Akira Agawa (Crown Zenith gold VSTAR artist) is the primary demand driver. Community initially cool on Darkrai IP, but Akira Agawa cards consistently command $50-200+ premiums and have a dedicated collector base. PC ETB already sold out at launch — eBay presales $200 vs $60 retail (3.3× pre-release). Regular ETB presale market $159.95 (TCGCSV).\n• **Comp: ME04 Chaos Rising ETB $355 / ME03 Perfect Order ETB $71.** Pitch Black lacks ME04\'s Charizard but has a stronger IP anchor than ME03. "Lost Origin vibes" (Phil, YouTube) — that set started cold, Gengar/Giratina art drove late demand. Morpeko SIR (gothic graffiti) may be the sleeper hit.\n• **Liquidity:** PC ETB sells through immediately (3× pre-release demand confirmed). Regular ETB has strong eBay velocity within ME series context. Tight allocation = compressed supply window.',
      product:     '• **Set:** ME05 Pitch Black — 5th expansion of Mega Evolution era, tied to Pokemon Legends ZA Mega Dimension DLC (Hyperspace Luminose area)\n• **ETB:** 9 packs + Zarude promo card + accessories | PC ETB: 11 packs + Zarude stamped promo + different packaging\n• **Theme:** Dark/gothic — Darkrai, Gengar Line (premium checklane), Luxray Line. Black booster box design (consistent across ME era, limits display appeal).\n• **Chase cards:** (1) Mega Darkrai SIR (Akira Agawa — biggest pull) (2) Mega Darkrai Hyper Rare (3) Morpeko SIR — unique dark/graffiti art, underrated (4) Mega Zeraora SIR (5) Mega Chandelure SIR (6) Gwin SIR (trainer)\n• **Risk flag:** Darkrai is polarizing — "Who likes Darkrai?" community reaction. Black box design doesn\'t photograph well for display collectors.',
      priceComp:   '• ME04: Chaos Rising (released 5/22): regular ETB $355 | PC ETB $999 — best comp but had Charizard\n• ME03: Perfect Order (released 3/27): regular ETB $71 | PC ETB $133 — weak, no top chase\n• ME: Ascended Heroes (released 1/30): regular ETB $174 | PC ETB $490 — midpoint comp\n• Pitch Black presale: regular ETB $159 (TCGCSV), PC ETB $200 (eBay) / $520 (TCGPlayer asks)\n• Base case range: regular ETB $180-220 post-launch; PC ETB $250-350',
      supplyDemand:'• **Supply:** Allocation reported as "shocking" (tight per YouTube video title). PC ETB sold out at Pokemon Center within hours of listing. Standard ETB: normal retailer allocation expected but ME era sets show consistent sell-through at Target/Walmart.\n• **Demand:** PC ETB pre-order demand confirms scalper/flipper interest despite lukewarm Darkrai sentiment. Akira Agawa fan base drives single-card demand → forces box cracking → absorbs sealed supply. ME series has maintained consistent sealed demand through ME01-ME04.',
      recs:        '• **Short term (launch):** PC ETB = primary target (sold out, $200 presale = already profitable if you have allocation). Regular ETB: buy retail, flip $130-175 in first 2 weeks.\n• **Medium term (3-6mo):** Hold 20-30% of regular ETBs for $180-220 if Akira Agawa card validates. PC ETB hold to $300-400.\n• **Risk management:** This is GREEN not DBLGREEN. If Darkrai sentiment stays cold at release, exit regular ETBs quickly (first 2 weeks). Don\'t over-allocate vs ME04.',
    },
  },
  '30th-etb': {
    label:      'Pokémon TCG 30th Celebration Elite Trainer Box',
    category:   'pokemon',
    set:        '30th Celebration',
    retail:     59.99,
    retailNote: 'Target / Walmart (estimated, unannounced)',
    releaseDate: '2026-09-16',
    releaseUrl: 'https://www.tcgplayer.com/search/pokemon/me-30th-celebration?productLineName=pokemon&setName=me-30th-celebration',
    preRelease:  true,
    forceRating: 'DBLGREEN',
    forceRisk:   '🟢🟢 Very Low — 30th anniversary = single largest Pokemon TCG milestone; globally synced release; presale pack already $165 market',
    tcgId:       null,
    ebayQuery:   'Pokemon 30th Celebration Elite Trainer Box',
    contents:    '9 booster packs + accessories | ALL-FOIL set (every card holofoil) | 128-card set | 30 Pikachu artist variants | New Futuristic Rare rarity | First global simultaneous worldwide release',
    pcExclusive: { label: 'PC Exclusive ETB', tcgId: null, note: 'Pokemon Center exclusive — primary bot/flip target; 25th anniversary PC ETB now $535-550 sealed' },
    sellThrough: {
      flip:   { range: '$130 – $175', units: '~200 – 400+ units' },
      hold:   { range: '$250 – $400', units: '~75 – 150 units (12-24mo)' },
      invest: { range: '$400+',       units: '~25 – 50 units (3+ yr, follows Celebrations trajectory)' },
    },
    bulkBuy:   '250+ units',
    risk:      '🟢🟢 Very Low',
    ebayFee:   0.13,
    evidence: [
      { source: 'TCGPlayer TCGCSV (verified)', date: '2026-06-28', point: '30th Celebration Pack (booster) presale market $165 — only 2 listings, shows extreme scarcity of supply pre-launch. ETB not yet listed on TCGPlayer.' },
      { source: 'YouTube: CrepChiefNotify (bot tutorial video, 2025)', date: '2025-12-01', point: 'PC ETB + standard ETB confirmed expected for 30th Anniversary — modeled on 25th Anniversary Celebrations. PC ETB primary bot target. "Biggest two: PC ETB + UPC." Community already building infrastructure 9+ months before launch.' },
      { source: 'eBay active listings (presale)', date: '2026-06-28', point: '39 active eBay presale ETB listings, median $442.95. Forward-product presale asking price — directionally bullish; confirms scalper appetite. 25th Anniversary Celebrations ETB ($79.99 retail) current sealed market $350-435.' },
    ],
    scenarios: [
      { label: 'Bear', prob: 10, text: 'Limited stock floods market at launch; secondary settles $90-110 (just above retail). Only if TPCi massively overprints relative to demand — unlikely given presale pack already at $165.' },
      { label: 'Base', prob: 55, text: '$140-180 at launch, holds $150 floor 6mo. 25th anniversary Celebrations ETB ($80 MSRP) hit $200+ in first year. 30th has higher IP weight + all-foil premium.' },
      { label: 'Bull', prob: 35, text: 'Global launch hysteria + rare all-foil format + 30th anniversary = $200-300 at release, $400+ in 24mo. Celebrations PC ETB ($80) now $535; this has higher demand ceiling.' },
    ],
    writeup: {
      market:      '• **Thesis — DBLGREEN: 30th anniversary is the single biggest Pokemon TCG milestone.** First-ever globally synced release (worldwide Sep 16) creates synchronized global demand spike — no regional delay arbitrage. The 30th Celebration set is ALL FOIL (every card holo) with a new Futuristic Rare rarity featuring YOSHIROTTEN Mewtwo/Mew art — a premium format Pokemon has never released before. Current presale data: 30th Celebration Pack selling at $165 market on TCGPlayer (presale, 2 listings). Standard ETBs not yet listed = early accumulation window.\n• **Comp: Celebrations 25th Anniversary ETB** ($79.99 MSRP) — hit $200-250 within months, now trades $350-435 sealed. But 30th has HIGHER IP weight (30th >> 25th as cultural milestone), unique all-foil format, and the globally synced release creates zero-delay arbitrage globally. Floor is the Celebrations trajectory at minimum.\n• **Liquidity:** PC ETB is the primary flip target (Pitch Black PC ETB at $520, PF PC ETB at $338). Standard ETB secondary liquidity very high — 25th anniversary Celebrations had 1000s of eBay sold/year for 5 years. Resell window is long.',
      product:     '• First-ever globally synced Pokemon TCG expansion (Sep 16, 2026 worldwide simultaneously — unprecedented)\n• ALL foil cards: every card in the set has holo treatment — premium collector format, not a standard ETB\n• 30 unique Pikachu card variants, each illustrated by a different artist — 30 mini chase targets per set\n• New "Futuristic Rare" rarity featuring YOSHIROTTEN art (Mewtwo, Mew) — premium Japanese artist collaboration\n• Dual day/night cycle card artwork across the set — unique visual theme\n• Standard ETB: 9 packs + accessories, $59.99 retail (unannounced but consistent with ME series pattern)\n• PC ETB: Pokémon Center exclusive, expected $80+ MSRP, very limited allocation — primary bot/flip target',
      priceComp:   '• Celebrations 25th ETB: $79.99 → $200 (3mo) → $350-435 now (5yr). 30th has higher milestone weight + unique format\n• Pitch Black PC ETB: $520 (most recent ME set PC ETB market). 30th PC ETB should command premium vs standard ME sets\n• Phantasmal Flames ETB: $160 market (2 months post-release). 30th > PF on IP weight + format uniqueness\n• Ascended Heroes ETB: $177 market (most recent). 30th is a harder set = higher floor expected\n• 30th Celebration Pack (booster): $165 market presale = comp for the all-foil pack EV, not ETB',
      supplyDemand:'• Supply: Globally synced launch = TPCi distributing to ALL markets simultaneously — no JP/EU supply arriving before EN. Retailer allocation expected heavy but demand will outstrip Target/Walmart supply on launch day. PC ETB = extremely limited (Pokémon Center only).\n• Demand: 30th anniversary is a once-in-a-career collector event. Mainstream media coverage expected. TCG veteran collectors + casual buyers + scalpers all competing simultaneously. Community botter tutorials already live 3 months before launch.\n• Historical read: Celebrations 25th had lines at Target launch day, sold out within hours, secondary 2.5× retail in week 1.',
      recs:        '• **Short term (launch day):** PC ETB is the primary target — bot or queue early. Standard ETB: max every account at retail. Flip standard at $140-175 within first 2 weeks for immediate cash.\n• **Long term (12-36mo hold):** Hold standard ETBs for Celebrations-style appreciation trajectory ($250-400+). PC ETBs are 3-5× retail ceiling minimum. Every unit held = compounding scarcity.\n• **Strategy:** Allocate 70% flip (fund more buys), 30% long hold. This is the Celebrations of the decade.',
    },
  },
  'ah-etb': {
    label:      'Ascended Heroes Elite Trainer Box',
    category:   'pokemon',
    set:        'Ascended Heroes',
    retail:     59.99,
    retailNote: 'Target / Walmart',
    releaseUrl: 'https://www.tcgplayer.com/product/668496',
    rating:     'DBLGREEN',
    tcgId:      668496,
    ebayQuery:  'Pokemon Ascended Heroes Elite Trainer Box',
    images:    [668496, 672735, 672733, 672734],
    contents:  '9 booster packs + sleeves, dice, coin, damage counters, storage box | 217-card set with Illustration Rares + Alt Arts',
    pcExclusive: { label: 'PC Exclusive ETB', tcgId: 668497, note: 'Pokemon Center variant commands massive premium — source separately if available' },
    sellThrough: {
      flip:   { range: '$155 – $190', units: '~200 – 300+ units' },
      hold:   { range: '$190 – $220', units: '~100 – 150 units' },
      invest: { range: '$220+',       units: '~50 – 75 units' },
    },
    bulkBuy:   '200+ units',
    risk:      '🟢🟢 Very Low',
    ebayFee:   0.13,
    writeup: {
      market:      '• Mega Evolution is the strongest IP Pokemon has released in the modern SV era\n• Social channels uniformly bullish — no cool-off signals visible\n• Collector + competitive buyer crossover is unusually wide for this set',
      product:     '• 217-card set: Mega Charizard, Blastoise, Venusaur + Gym Leaders (Erika, Larry)\n• Illustration Rares and Alt Arts driving active rip demand — buyers chasing pulls\n• PC Exclusive ETB at $495 signals demand ceiling is far above standard ETB market',
      priceComp:   '• Obsidian Flames ETB peaked $120 | Paradox Rift $130 | Stellar Crown $140\n• AH at $177 market with $155 floor = genuine IP premium, not hype overhang\n• $155 floor nets $79/unit after fees — downside is minimal',
      supplyDemand:'• Target/Walmart stocking sparingly — no mass restock events observed\n• Retail velocity high; shelf life measured in hours when restocked\n• Supply tightens through Q3 as no additional print run signals visible',
      recs:        '• **Short term:** Floor at $155–170, move volume steadily — don\'t dump below $155\n• **Long term:** Hold to $190–220+ as Q3 supply depletes — set has legs\n• Max every account at retail. This is the floor ETB of the SV era.',
    },
  },
  'ah-bb': {
    label:      'Ascended Heroes Booster Bundle',
    category:   'pokemon',
    set:        'Ascended Heroes',
    retail:     29.99,
    retailNote: 'Target confirmed',
    releaseUrl: 'https://www.tcgplayer.com/product/668500',
    rating:     'GREEN',
    tcgId:      668500,
    ebayQuery:  'Pokemon Ascended Heroes Booster Bundle',
    images:    [668500],
    contents:  '6 booster packs — no accessories | Lower entry, high-volume flip',
    sellThrough: {
      flip:   { range: 'market-derived', units: '~4 – 8 units' },
      hold:   { range: 'market-derived', units: '~3 – 5 units' },
      invest: { range: 'market-derived', units: '~2 – 4 units' },
    },
    risk:      '🟢 Low',
    ebayFee:   0.13,
    writeup: {
      market:      '• Social demand for AH packs is sustained — buyers chasing Illustration Rares\n• Bundle format preferred over single packs for perceived value and feel-good rip appeal\n• No cool-off signals; consistent eBay sold velocity above $85',
      product:     '• 6-pack bundle — no accessories overhead, pure pack content\n• Lower entry point brings in buyers priced out of the ETB\n• Accessible format drives faster account-per-unit turnover',
      priceComp:   '• $30 retail vs $105 market = ~3.5x multiple — highest R/R ratio in AH lineup\n• $85 conservative floor still nets ~$44/unit after 13% fees\n• ETB is the prestige hold; BB is the cash-flow play',
      supplyDemand:'• No mass restock signals — supply tracking similar to ETB scarcity\n• Demand outpacing shelf velocity at most Target/Walmart locations\n• Pairs as a filler buy alongside ETB bulk — easy add-on per account visit',
      recs:        '• **Short term:** Flip at $90–105, fast turnover — no reason to hold long\n• **Long term:** Skip the hold; ETB appreciates, BB does not hold premium as well\n• Buy every unit you see at retail — quickest cash conversion in the AH set',
    },
  },
  'pe-etb': {
    label:      'Prismatic Evolutions Elite Trainer Box',
    category:   'pokemon',
    set:        'Prismatic Evolutions',
    retail:     49.99,
    retailNote: 'Target · Walmart · $49.99 MSRP',
    releaseUrl: 'https://www.tcgplayer.com/product/593355',
    rating:     'DBLGREEN',
    tcgId:      593355,
    ebayQuery:  'Pokemon Prismatic Evolutions Elite Trainer Box',
    images:    [593355],
    contents:  '9 booster packs + sleeves, dice, coin, damage counters, storage box | Eevee & all 8 Eeveelutions',
    sellThrough: {
      flip:   { range: 'market-derived', units: '' },
      hold:   { range: 'market-derived', units: '' },
      invest: { range: 'market-derived', units: '' },
    },
    risk:      '🟢 Low',
    ebayFee:   0.13,
    writeup: {
      market:      '',
      product:     '• 9 boosters + full ETB accessories | Eevee + all 8 Eeveelutions — SV8a Scarlet & Violet\n• Eeveelution IP is the most multigenerational collector driver in modern Pokemon TCG — spans every age group\n• SV mechanic cards (Tera ex, Illustration Rares) sustain competitive rip demand alongside collector demand\n• No IP fatigue risk — Eevee appears in every mainline game, ensuring perpetual new-player entry points',
      priceComp:   '',
      supplyDemand:'• Reprinted Jan 15, 2025 (2 days after launch) and multiple waves since — supply absorbed each time without price collapse\n• 17 months on market: still trading 2.9× retail — no other SV-era set has maintained this premium through repeated restocks\n• Sam\'s Club PE SPC (Jul 21, 2026) will add adjacent supply pressure — monitor ETB floor around that date\n• PC Exclusive / Super Premium variants have separate supply curves; do not conflate with standard ETB',
      recs:        '• **Short term:** Flip $150–170 at retail ($49.99) — 13% fees leave $80–95/unit net\n• **Long term:** Hold to $185–200 as each restock wave absorbs and floor lifts — Eeveelution IP has no known demand ceiling\n• Do not pay over $80 secondary — secondary cost basis compresses margins significantly\n• PE SPC drop Jul 21 at Sam\'s Club: separate play, higher entry, tighter supply — source if available below $80',
    },
  },
  'pe-spc': {
    label:      'Prismatic Evolutions Super Premium Collection',
    category:   'pokemon',
    set:        'Prismatic Evolutions',
    retail:     79.99,
    retailNote: 'PCK / BestBuy',
    retailVerified: true,
    releaseUrl: 'https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/sv-series/sv8a/',
    rating:     'DBLGREEN',
    tcgId:      null,
    ebayQuery:  'Pokemon Prismatic Evolutions Super Premium Collection',
    images:    [],
    contents:  '11-16 boosters + Eevee plush (~$35-50 resale alone) + promo cards + full ETB accessories',
    stockNote: "Sam's Club dropping ~6,000 units on 7/21 — 2 per account",
    sellThrough: {
      flip:   { range: 'market-derived', units: '~20 – 50 units' },
      hold:   { range: 'market-derived', units: '~10 – 20 units' },
      invest: { range: 'market-derived', units: '~5 – 10 units' },
    },
    risk:      '🟢 Low',
    ebayFee:   0.13,
    writeup: {
      market:      "• Social intel shows heavy account prep ahead of 7/21 — demand confirmed active\n• Eevee plush drives crossover buyers (non-TCG toy collectors entering market)\n• Prior SPC drops (Celebrations, Crown Zenith) held market 60+ days post-drop",
      product:     "• 11-16 boosters + Eevee plush ($35-50 resale standalone) + promo cards + full ETB accessories\n• Plush effectively lowers cost basis on boosters to under $45\n• Two distinct buyer segments: sealed collectors and plush resellers",
      priceComp:   "• $80 retail vs $130-155 market — tighter multiple than ETB but floor is defensible\n• Plush standalone value props up sealed floor even if pack market softens\n• Comp: Crown Zenith SPC held $130+ for 90 days before gradual decline",
      supplyDemand:"• Sam's Club 6,000 units sounds large but 2-per-account cap disperses fast\n• Membership requirement caps buyer pool to Sam's members only\n• Account farming confirmed active — drop will clear faster than unit count suggests",
      recs:        "• **Short term:** Max accounts on 7/21, flip $130–145 within first 2 weeks\n• **Long term:** Hold plush-sealed bundles to $155-170 as Sam's stock fully clears\n• Prep Sam's accounts NOW — add to List before drop day",
    },
  },
  'cr-bb': {
    label:        'Chaos Rising Booster Bundle',
    category:     'pokemon',
    set:          'Chaos Rising',
    retail:       29.99,
    retailNote:   'Target · SKU 95298172',
    releaseUrl:   'https://www.target.com/p/-/A-95298172',
    walmartItemId:'19986002628',
    rating:       'ORANGE',
    tcgId:        684456,
    ebayQuery:    'Pokemon Chaos Rising Booster Bundle ME04',
    images:    [684456],
    contents:  '6 booster packs',
    sellThrough: {
      flip:   { range: '$35 – $48', units: '~3 – 5 units' },
      hold:   { range: '$40 – $52', units: '~2 – 4 units' },
      invest: { range: '$45 – $60', units: '~1 – 3 units' },
    },
    bulkBuy:   '3 – 5 units',
    risk:      '🟠 Medium-High',
    ebayFee:   0.13,
    writeup: {
      market:      '• Social sentiment neutral-to-negative — channel chatter focused on AH and ME05\n• CR BB is not a demand story; it\'s a supply arbitrage play with thin margin\n• No chase card narrative driving buyer urgency',
      product:     '• 4-5 booster packs, no accessories — pure pack content at entry price\n• 7,000+ Target units = wide supply footprint, slow shelf clear\n• No differentiating product feature vs AH BB at similar price range',
      priceComp:   '• $30 retail vs $35-48 market = $5-18 margin before fees\n• After 13% eBay fee: $3-11/unit net — not worth the effort at scale\n• AH BB at same price point has 3x the margin; always prioritize over CR BB',
      supplyDemand:'• 7K+ units will not clear quickly — expect weeks of suppressed pricing\n• Wide availability means no scarcity premium; price ceiling is capped\n• ETB (<1K units) is the correct ME04 play — BB is the pass',
      recs:        '• **Short term:** Skip unless buying at $15-20 clearance (rare)\n• **Long term:** No hold value — ME secondary bundles depreciate\n• Only buy if bundled with ETBs in a bulk lot at blended favorable pricing',
    },
  },
  'pb-bb': {
    label:      'Pitch Black Booster Bundle',
    category:   'pokemon',
    set:        'Pitch Black',
    retail:     29.99,
    retailNote: 'Target · SKU 1011483414 · Limit 2',
    releaseUrl: 'https://www.target.com/p/-/A-1011483414',
    rating:     'GREEN',
    tcgId:      692942,
    ebayQuery:  'Pokemon Pitch Black Booster Bundle ME05',
    images:    [],
    contents:  '4-5 booster packs — no accessories | Blister: SKU 1011483408 | Display: SKU 1011483413',
    releaseDate: '<t:1784318400:F> (<t:1784318400:R>) | Pre-order live NOW',
    sellThrough: {
      flip:   { range: '$45 – $65', units: '~4 – 6 units' },
      hold:   { range: '$55 – $70', units: '~3 – 5 units' },
      invest: { range: '$65 – $85', units: '~2 – 3 units' },
    },
    risk:      '🟡 Medium',
    ebayFee:   0.13,
    writeup: {
      market:      '• Lower social intensity than AH but consistent pre-order demand building\n• Darkrai collector base actively seeking packs — rip demand will drive bundle sales\n• Booster Display (SKU 1011483413) is the bulk buyer\'s better SKU — flag separately',
      product:     '• ME05 | 4-5 booster packs, no accessories — pure pack content\n• Darkrai Illustration Rares + Alt Arts are the chase targets driving rip demand\n• Pre-order limit reportedly 10/account on BB — higher per-account access than ETB',
      priceComp:   '• $30 retail vs $45-65 market target = 50-100% gain — competitive with AH BB at launch\n• Less upside ceiling than ME05 ETB but moves faster at $30 entry\n• BB is the volume play; ETB is the margin play — run both',
      supplyDemand:'• Higher per-account limit than ETB (10 vs 2) = better volume access\n• Booster Display SKU allows higher pack count per single purchase\n• Supply should move faster than CR BB due to stronger Darkrai IP demand',
      recs:        '• **Short term:** Pre-order max accounts, flip $50-65 at drop — fast turn\n• **Long term:** No hold; BB premium fades within 60 days as supply normalizes\n• Also grab Booster Display (SKU 1011483413) — better pack efficiency per buy',
    },
  },
  'chrome-disney-2026': {
    label:       '2026 Topps Chrome Disney',
    category:    'disney_cards',
    set:         'Topps Chrome',
    retail:      429.99,
    retailNote:  'MSRP · EQL Release · 6/17 12PM EST',
    releaseUrl:  'https://www.topps.com/pages/topps-chrome-disney',
    tcgId:       null,
    supplyScore: 20,
    liveMarket:  { market: 600, low: 550, high: 700, sales: 0, note: 'Pre-release estimate — no eBay comps yet (6/16/26)' },
    ebayQuery:   '2026 Topps Disney Chrome Entertainment Hobby',
    images:      [],
    contents:    '12 packs × 6 cards | autographs per box | Disney character IP — Chrome refractor treatment',
    releaseDate: '<t:1781712000:F> (<t:1781712000:R>) | EQL',
    sellThrough: {
      flip:   { range: '$550 – $700', units: '~30 – 50 boxes' },
      hold:   { range: '$600 – $750', units: '~15 – 25 boxes' },
      invest: { range: '$700 – $900', units: '~10 – 15 boxes' },
    },
    bulkBuy:  '~30 – 50 boxes',
    risk:     'Low-Medium',
    ebayFee:  0.13,
    writeup: {
      market:      '• Disney IP = crossover collector segment (non-sports + TCG + Disney fans) drives demand beyond typical sports card buyers\n• Disney Genesis (prior Topps collab) was a confirmed cook — direct historical comp\n• EQL release = intentionally supply-constrained by design; all buyers enter at same price',
      product:     '• 12 packs × 6 cards — mid-size box format, Chrome refractor treatment\n• Auto type TBD at press time — on-card would significantly lift ceiling\n• Disney character roster unknown pre-drop; iconic characters (Mickey, Vader crossover, Princesses) drive premium\n• No checklist posted — character quality is the primary post-drop price driver',
      priceComp:   '• MSRP $429.99 | No eBay pre-order comps — EQL locks out pre-market\n• Disney Genesis (best direct comp): flew at retail, secondary market ran 30-50% above MSRP within 30 days\n• Chrome format adds refractor/parallel chase layer vs Genesis — ceiling higher if auto subjects are elite',
      supplyDemand:'• EQL = every entrant gets equal shot, no bot advantage — fairest possible allocation\n• Disney + Chrome = two distinct collector audiences converging on one SKU\n• Supply fixed at EQL allocation; no FCFS restock mechanism\n• Demand signal: Genesis sold out immediately; Chrome branding adds incremental premium',
      recs:        `• **Cost basis: ~$464** ($429.99 + ~8% tax) | eBay 13% fee on sale\n• **Short term:** Target $550-620 flip = ~$14-74/box net after fees — enter EQL, flip day-of or within 48hrs\n• **Long term:** Hold to $700-900 range as Disney IP scarcity compounds — 6-12mo thesis\n• EQL: enter max quantity allowed; auto type reveal post-break will be primary catalyst for price movement`,
    },
  },
  'munkomon-choeymon-2026': {
    label:       'David Choe Choeymon "Munkomon" Sealed Pack (LE 888)',
    category:    'noncard',
    set:         'David Choe / Art Collectible',
    retail:      97.13,
    retailNote:  'MSRP $97.13/pack (verified: MUNKO 8-Pack $777 ÷ 8, Apr 3 2026 drop)',
    releaseUrl:  'https://davidchoe.com/blog/munko',
    tcgId:       null,
    supplyScore: 30,
    liveMarket:  null,
    ebayQuery:   'David Choe Choeymon Munkomon sealed pack 888',
    images:      [],
    contents:    '10 cards/pack | Pokemon-parody art by David Choe | chance at 1/1 original David Choe art piece | edition capped at 888 packs | sold via Artsy/Grail art channels',
    releaseDate: 'Jan 2026 (1st drop) | 2nd drop followed (Ohtani)',
    sellThrough: {
      flip:   { range: 'market-driven', units: 'secondary only' },
      hold:   { range: 'market-driven', units: 'secondary only' },
      invest: { range: 'SKIP',          units: 'N/A' },
    },
    bulkBuy:  'secondary only — 888 cap',
    risk:     'High',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis:** This is an ART play, not a TCG — David Choe (street-art blue-chip, "Beef", the Facebook-mural fortune) put his name on a Pokemon-parody pack capped at **888**, with a chance at a **1/1 original Choe art piece** inside. Value rides Choe\'s art-market standing + meme virality, not card playability. Closest comps are artist-drop collectibles (KAWS/Murakami-style scarcity), which run on hype cycles — wide price dispersion, not a stable floor.\n• **Liquidity:** Thin + speculative — 888 units, no MSRP, sold through art channels (Artsy/Grail) then flipped on eBay. Bids cluster around hype events (2nd Ohtani drop, Choe media). Real depth is shallow vs a mainstream set.\n• **Risk:** Highest tier — artist-novelty drops are momentum assets that can round-trip hard once attention fades; authenticity/sealed-state critical; no public MSRP means no anchor. Buy only on conviction in Choe\'s name, size small, flip into hype.',
      product:     '• Sealed pack, 10 cards — Pokemon-parody artwork by David Choe; edition capped at 888 packs\n• Headline chase: a chance at an embedded 1/1 ORIGINAL David Choe art piece (the lottery driving pack premiums)\n• Sold via art channels (Artsy/Grail), not card retail — values set by the art market + secondary flips\n• Sealed/unsearched state is the whole value; a "searched" pack is worthless',
      priceComp:   '',
      supplyDemand:'',
      recs:        '• No public MSRP — treat eBay secondary median as the real market (see embed)\n• Pure speculation on Choe\'s name + 1/1 art lottery; not a fundamentals play\n• Size small, flip into hype windows (new drops / Choe press); don\'t bag-hold\n• Verify sealed + seller rep — fakes/searched packs follow scarce hyped drops',
    },
  },
  'munko-12-disciple-2026': {
    label:       'David Choe MUNKO 12 Disciple Set — All Signed (Apr 3 2026 drop)',
    category:    'noncard',
    set:         'David Choe / Art Collectible',
    retail:      4444,
    retailNote:  'MSRP $4,444 (verified order) · 12 hand-signed pieces · Apr 3 2026 drop',
    releaseUrl:  'https://davidchoe.com/blog/munko',
    tcgId:       null,
    supplyScore: 32,
    liveMarket:  null,
    ebayQuery:   'David Choe Munko 12 disciple set signed',
    images:      [],
    contents:    '12-piece set, each hand-signed by David Choe | Apr 3 2026 drop | top-tier of the Munko/Munkomon line',
    releaseDate: 'Apr 3 2026 drop',
    sellThrough: {
      flip:   { range: 'market-driven', units: 'secondary only' },
      hold:   { range: 'market-driven', units: 'secondary only' },
      invest: { range: 'SKIP',          units: 'N/A' },
    },
    bulkBuy:  'secondary only',
    risk:     'High',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis:** Top tier of the Munko/Munkomon line — 12 pieces ALL hand-signed by David Choe at $4,444 MSRP. The signature is the asset: this is original-artist-signed work, the most defensible Choe collectible vs the gamble of a sealed pack (where the 1/1 art is a lottery). Signed complete sets are the format serious Choe collectors target, so it should hold value better than single packs.\n• **Liquidity:** Very thin — high four-figure art pieces move slowly and to a narrow collector base; sells through art channels + Grailed/eBay, not volume marketplaces. Few comps, wide spreads.\n• **Risk:** High ticket + thin liquidity = hard to exit fast; value tracks Choe\'s art-market trajectory and the line\'s staying power. Signed-set authenticity/COA is paramount; momentum drops can cool. Conviction hold, not a quick flip.',
      product:     '• 12-piece set, each piece hand-signed by David Choe — signature is the value driver\n• Top SKU of the Apr 3 2026 Munko drop ($4,444 MSRP, verified)\n• Sold via Choe art channels — values set by the art market, not card retail\n• Keep all 12 + COA/signatures pristine; a broken/unsigned set collapses in value',
      priceComp:   '',
      supplyDemand:'',
      recs:        '• Cost basis ~$4,800 ($4,444 + ~8% tax) | thin secondary — price discovery slow\n• Signed-set = the defensible Choe hold vs pack-lottery speculation\n• Exit into Choe press/new-drop hype; expect wide bid/ask\n• Verify every signature + COA on secondary — high-ticket fakes follow signed art',
    },
  },
  'brunson-gold-jersey-2026': {
    label:       'Jalen Brunson Knicks Nike 2026 Finals Champions Gold Standard Authentic Jersey (LE /36)',
    category:    'noncard',
    set:         'NBA Memorabilia / Fanatics',
    retail:      750,
    retailNote:  'MSRP · Fanatics raffle (Jun 18–20 9AM EDT) · numbered 1–36',
    releaseUrl:  'https://www.fanatics.com/nba/new-york-knicks/jalen-brunson-new-york-knicks-nike-2026-nba-finals-champions-authentic-icon-gold-standard-jersey-limited-edition-of-36-blue/o-6825+t-36923097+p-799926129342+z-8-989991947',
    tcgId:       null,
    supplyScore: 28,
    liveMarket:  null,
    ebayQuery:   'Jalen Brunson Knicks 2026 Finals Champions Gold Standard Authentic Jersey /36',
    images:      [],
    imageUrl:    'https://images2.minutemediacdn.com/image/upload/c_crop,x_0,y_39,w_563,h_316/c_fill,w_1440,ar_1440:810,f_auto,q_auto,g_auto/images/voltaxMediaLibrary/mmsport/jerseys_on_si/01kvg63j16ed260ggcxj.jpg',
    contents:    'Nike Authentic Icon on-court jersey recast in commemorative gold | metallic NY wordmark | gold Finals patch (3 titles) | stitched tackle-twill + woven jock tag | ships in Nike NBA Finals Presentation Box (3mm acrylic display case ~20"×16.25" + stand) | numbered 1–36 (Brunson = 36th captain) | app-only Product Drop',
    releaseDate: 'Fanatics raffle Jun 18–20 2026 9AM EDT',
    sellThrough: {
      flip:   { range: '$2,500 – $5,000',  units: 'win allocation' },
      hold:   { range: '$4,000 – $8,000',  units: 'win allocation' },
      invest: { range: '$6,000 – $15,000+', units: 'win allocation' },
    },
    bulkBuy:  'raffle — 1 per entrant if won',
    risk:     'Medium',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis:** Knicks first NBA title in 50+ years (since 1973) — a generational, once-a-half-century franchise moment, with Brunson as the Finals captain/face. The Gold Standard Authentic is the top memorabilia tier (on-court Nike Authentic recast in gold), and only **36 exist**, numbered to Brunson as the 36th Knicks captain. Drought-breaking championship authentics of the title-winning star are blue-chip memorabilia — comparable championship LE jerseys trade **3–8× retail**; $750 base × 36-unit scarcity × the #1 NYC market points to a multi-thousand secondary.\n• **Liquidity:** Largest US media market + 50-year drought = enormous demand against 36 pieces. Raffle allocation (closes 6/20 9AM EDT) means almost everyone is forced to the secondary — buyers, not sellers, dominate.\n• **Risk:** Memorabilia is slower/thinner to move than cards and authentication + condition gate value; price is in early discovery (just dropped) so expect a spike-then-settle. Long-term ceiling rides Brunson\'s legacy and whether the Knicks repeat — a one-off title holds, a dynasty multiplies it.',
      product:     '• Nike **Authentic Icon** on-court jersey (pro-cut, stitched) recast in commemorative gold — not a replica/Fast Break\n• Metallic New York wordmark + gold NBA Finals patch (championship "3"); individually numbered 1–36\n• Ships in a Nike NBA Finals Presentation Box — 3mm acrylic display case (~20"×16.25") with pop-out stand; it\'s built as a display piece, not gameworn apparel\n• Allocation by app-only Product Drop (selection, charged only if picked) — hard-capped at 36, no restock\n• Keep jock tag + numbered tag + presentation box intact — authentication, serial, and the case are the whole value',
      priceComp:   '',
      supplyDemand:'',
      recs:        '• **Cost basis: ~$810** ($750 + ~8% tax) if you win the raffle\n• Targets + net/ROI live from pipeline comps — see embed\n• Win = immediate 3–8× flip candidate, or hold on Brunson legacy\n• Verify serial/COA on any secondary buy — fakes follow scarce championship gear',
    },
  },
  'ye-bully-signed-vinyl': {
    label:       'Ye (Kanye West) — BULLY Signed Vinyl LP (Limited 1st Press)',
    category:    'noncard',
    set:         'Music / Signed Vinyl',
    retail:      50,
    retailNote:  'MSRP $50 signed (bully.yeezy.com) · 1st press · variants: black/Clear/Red/Chrome/White + CD',
    releaseUrl:  'https://bully.yeezy.com/',
    tcgId:       null,
    supplyScore: 24,
    liveMarket:  null,
    ebayQuery:   'Ye Kanye West Bully signed vinyl LP autographed',
    images:      [],
    contents:    'Signed 1st-press BULLY LP (autographed by Ye) | colorway variants: black, Clear, Red, Chrome, White (+ signed CD) | sold direct via bully.yeezy.com | Ye\'s first official signed release at scale',
    releaseDate: 'Mar 2026 signed drop (bully.yeezy.com)',
    sellThrough: {
      flip:   { range: 'market-driven', units: 'secondary only' },
      hold:   { range: 'market-driven', units: 'secondary only' },
      invest: { range: 'market-driven', units: 'secondary only' },
    },
    bulkBuy:  'secondary / drop allocation',
    risk:     'Medium',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis (TWO-TIER — this is the whole story):** The $50 online "signed" copies are almost certainly **AUTOPEN** — Yeezy support won\'t confirm hand-signing and the scale (thousands+, stayed in stock hours, not seconds) only makes sense for machine signing. Autopen ≠ autograph: that\'s a commodity print, not a collectible auto. The REAL grail is the genuinely **hand-signed SoFi (Apr 1) concert copies** (visibly different signature, listed "NO AUTO-PEN") — a tiny, separate, far-scarcer tier.\n• **Liquidity:** Online/autopen tier moves at $150–200 today on heavy volume, but that\'s speculation on an UNVERIFIED auto — fragile once the autopen story spreads. Hand-signed concert copies are thin but command a true premium.\n• **Risk:** HIGH and mispriced. The premium rests on a signature Yeezy itself won\'t guarantee — autopen confirmation could collapse the online tier toward the ~$40 unsigned price. Plus Ye headline volatility. Only the verified hand-signed (concert, photo-matched) tier has a durable thesis.',
      product:     '• ⚠️ Authenticity is the entire product question: online $50 "signed" = suspected AUTOPEN (Yeezy will not confirm hand-signed); concert (SoFi Apr 1) copies = genuine hand-signed, different signature\n• Colorway variants: black / Clear / Red / Chrome / White (+ CD) — only matters if the auto is real\n• Yeezy-direct provenance proves it came from Yeezy, NOT that Ye personally signed it\n• Value gate: photo-match / concert provenance. An autopen "auto" is worth a hair over the unsigned LP',
      priceComp:   '',
      supplyDemand:'',
      recs:        '• ⚠️ AUTOPEN RISK: online "signed" tier premium ($150–200) sits on an unverified signature — treat as a fast flip, NOT a hold; autopen confirmation craters it toward the ~$40 unsigned LP\n• The only real hold = verified HAND-SIGNED concert (SoFi Apr 1) copies, photo-matched\n• If flipping online copies: sell NOW into demand before the autopen story matures\n• Never pay a hand-signed premium without photo-match/provenance — Yeezy-direct ≠ hand-signed',
    },
  },
  'mtg-sl-purr-majesty': {
    label:       'MTG Secret Lair: Purr Majesty (Cats Are the Best Superdrop)',
    category:    'mtg',
    set:         'Magic: The Gathering / Secret Lair',
    retail:      29.99,
    retailNote:  'MSRP $29.99 non-foil / $39.99 foil · Secret Lair · released 6/15/26',
    releaseUrl:  'https://secretlair.wizards.com/us/en/product/1252572/purr-majesty',
    tcgId:       null,
    supplyScore: 14,
    liveMarket:  null,
    ebayQuery:   'MTG Secret Lair Purr Majesty sealed',
    images:      [],
    contents:    '5 cards: Court of Grace, Reverent Mantra, Windborn Muse, Queen Marchesa, Ruinous Ultimatum | non-foil ($29.99) + traditional foil ($39.99) editions | Cats Are the Best Superdrop',
    releaseDate: 'Released June 15, 2026',
    sellThrough: {
      flip:   { range: 'market-driven', units: 'secondary only' },
      hold:   { range: 'market-driven', units: 'secondary only' },
      invest: { range: 'SKIP',          units: 'N/A' },
    },
    bulkBuy:  'print-to-demand window',
    risk:     'Medium-High',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis — FOIL is the play, and scarcity now backs it:** Secret Lair is **LIMITED PRINT RUN** as of Feb 2026 (WotC confirmed: no return to print-on-demand) — drops are pre-printed and CAN sell out. That means real sealed scarcity, so sealed foil can appreciate, not just the singles. The value driver is still the SL-exclusive **Reverent Mantra foil (~$95 single)**, which alone makes the $39.99 foil (~$103 singles total, ~2.6×).\n• **Liquidity:** Foil has a deep bid (Reverent Mantra is the chase) AND sealed foil now carries a scarcity premium post-sellout — two exit paths (crack-for-single OR flip sealed). Non-foil singles total $26.70 < $29.99 MSRP = still soft, but limited print gives even sealed non-foil a longer-dated scarcity floor.\n• **Risk:** Value concentrated in ONE card — a reprint of Reverent Mantra in another product (not the SL itself, which is capped) is the real threat. Limited-run removes the old oversupply risk but raises entry price as it sells out. Foil = a one-card scarcity bet.',
      product:     '• 5-card Secret Lair; value concentrated — Reverent Mantra (foil) is ~90% of the foil edition\'s worth\n• Two editions: non-foil $29.99 (singles soft) / traditional foil $39.99 (the play)\n• **LIMITED PRINT RUN** (not print-on-demand) — fixed supply, sells out → genuine sealed scarcity\n• Two exits: crack foil for the Reverent Mantra single, OR hold sealed foil on post-sellout scarcity',
      priceComp:   '',
      supplyDemand:'',
      recs:        '• Foil edition: ~$40 in → ~$103 singles (Reverent Mantra carries it). Limited print run = sealed foil also holds scarcity — two exits\n• Crack-for-single OR hold sealed foil; non-foil = lower priority (singles soft, but limited-run gives a longer floor)\n• Watch for a Reverent Mantra reprint in OTHER products — that, not SL oversupply, is the real risk\n• Buy before sellout — limited print run means entry price climbs, not falls, as stock clears',
    },
  },
  'mtg-marvel-super-heroes': {
    label:       'MTG Marvel Super Heroes — Set + SL Spinner Rack Specials',
    category:    'mtg',
    set:         'Magic: The Gathering / Universes Beyond',
    retail:      455.88,
    retailNote:  'Collector Booster box ~$455.88 (12×$37.99) · releases June 26, 2026',
    releaseUrl:  'https://magic.wizards.com/en/news/feature/marvel-super-heroes-buyers-guide',
    tcgId:       null, supplyScore: 8, liveMarket: null,
    ebayQuery:   'MTG Marvel Super Heroes collector booster box',
    images:      [], forceRating: 'ORANGE', risk: 'High', ebayFee: 0.13,
    contents:    'Full UB expansion (270 main cards, 75% legendaries — highest in MTG history) | Play Display $209.70 · Collector box ~$455.88 · Bundle $69.99 · Gift Bundle $89.99 (foil Daredevil) · 4 Commander decks | tie-in: SL x Marvel Spinner Rack Specials (5 foil-only, MagicCon Amsterdam Jul 17)',
    releaseDate: 'Releases June 26, 2026 (prerelease Jun 19-25)',
    sellThrough: { flip: { range: 'SL foils day0 only (+200-400%)', units: '72h window' }, hold: { range: 'SKIP sealed', units: 'fades' }, invest: { range: 'SKIP', units: 'N/A' } },
    bulkBuy:  'skip sealed', ebayFee: 0.13,
    writeup: {
      market:      '• **Thesis — fade risk, no pre-spike:** Collector boxes sit AT MSRP ($450-500) in preorder — no scarcity premium (vs Final Fantasy $900+ at same stage). Marvel hype historically bleeds: SL Marvel ’24 crashed 30-70% in week 1; Spider-Man set $977 peak → $339 (-65%). 75%-legendary rate breaks Standard = Commander/collector demand only.\n• **Liquidity:** Deep for SL foil singles day0 (rainbow-foil chase), thin/declining for sealed CB box. No spec premium expected.\n• **Risk:** Marvel fatigue (10+ yrs product, 4 UB + 3 in-universe sets), format bloat caps playability demand. Sealed = depreciating asset.',
      product:     '• **Day0:** CB box at/near MSRP $450-500 (no pre-spike — bearish). SL Spinner Rack foils spike +200-400%.\n• **1-4wk:** SL foils dump 30-70% (every Marvel SL bleeds post-window). CB box drifts down.\n• **Onward:** CB box → ~$340-370 by 9mo (Spider-Man trajectory). High variance only if a chase legendary (Iron Man/Black Panther Cmdr) spikes.\n• **Comp:** SL Marvel ’24 $39.99→peak $211→settled ~1.5-2× over 18mo. Spider-Man set -65% in 9mo.',
      priceComp: '', supplyDemand: '',
      recs:        '• 🟠 SKIP sealed CB box spec — Spider-Man comp = -65%, no pre-spike, Marvel fatigue.\n• Only play: crack SL Spinner Rack foils day0, flip within 72h BEFORE the 30-70% bleed.\n• Watch for chase-legendary Commander spike as the lone upside catalyst.',
    },
  },
  'mtg-festival-in-a-box-2026': {
    label:       'MTG Festival in a Box 2026 — MagicCon Amsterdam + Atlanta',
    category:    'mtg',
    set:         'Magic: The Gathering / MagicCon',
    retail:      225,
    retailNote:  'MSRP ~$200-250 · Amsterdam Jun 29 / Atlanta Oct 26, 2026 · event-capped supply',
    releaseUrl:  'https://magic.wizards.com/en/events',
    tcgId:       null, supplyScore: 22, liveMarket: null,
    ebayQuery:   'MTG Festival in a Box MagicCon',
    images:      [], forceRating: 'GREEN', risk: 'Medium', ebayFee: 0.13,
    contents:    'Buy-to-attend-remotely event box: convention-exclusive foil promos, playmat, drop tokens | hard supply cap (attendance-driven print) | promo reveal not yet announced (Amsterdam overdue)',
    releaseDate: 'Amsterdam Jun 29, 2026 · Atlanta Oct 26, 2026',
    sellThrough: { flip: { range: '+40-100% (wk3-4 peak)', units: 'event-capped' }, hold: { range: '+20-60% (6-12mo)', units: 'hard cap' }, invest: { range: '+20-60%', units: 'promo-gated' } },
    bulkBuy:  'event-limited', ebayFee: 0.13,
    writeup: {
      market:      '• **Thesis — best risk/reward of the slate:** Event-capped supply (buy-to-attend-only) + exclusive foil promos = structural scarcity. Comp boxes hold +20-60% long-term, peak +75-100% at 4wk. Promo card carries 50-75% of box value.\n• **Liquidity:** Sells out fast (recent boxes <4h). Deep secondary; chase promo (Sliver/Commander staple in exclusive frame) sets the floor.\n• **Risk:** Value gates entirely on the promo reveal — NOT yet announced (Amsterdam overdue). Weak/non-staple promo = underperforms; base cards reprinted later (only the art frame stays exclusive).',
      product:     '• **Day0:** ~+40% premium ($280-340 on $200-250 MSRP).\n• **1-4wk:** peaks +75-100% ($350-450).\n• **Onward (6-12mo):** normalizes +20-60% ($300-400). Holds — hard supply cap.\n• **Comp:** Chicago ’25 $200→$402 · LV ’25 $250→$361 · Atlanta ’25 $200→$350+. Sliver Legion foil promo ($190) carried Atlanta.',
      priceComp: '', supplyDemand: '',
      recs:        '• 🟢 FULL SEND on promo reveal — buy day0, supply is hard-capped.\n• Sliver / Commander-staple promo in exclusive frame = max buy; vanilla promo = pass.\n• Peak exit = week 3-4 (+75-100%); long hold still nets +20-60%.\n• Amsterdam promo overdue — watch for the announcement to confirm conviction.',
    },
  },
  'mtg-hobbit-set': {
    label:       'MTG The Hobbit — Universes Beyond Set',
    category:    'mtg',
    set:         'Magic: The Gathering / Universes Beyond',
    retail:      144,
    retailNote:  'Collector Booster box ~$144 wholesale ($37.99/pack) · releases Aug 14, 2026',
    releaseUrl:  'https://magic.wizards.com/en/products/the-hobbit',
    tcgId:       null, supplyScore: 6, liveMarket: null,
    ebayQuery:   'MTG The Hobbit collector booster box',
    images:      [], forceRating: 'GREEN', risk: 'Medium', ebayFee: 0.13,
    contents:    '271-card UB expansion | box topper: The One Ring (reprint) | ultra-chase: Smaug the Magnificent (Gleaming Gold, ~500 copies, <1% CB pull) | Bundle $69.99 · Draft Night $119.99 · Scene Boxes $41.99 | preorders OOS now (CB/Bundle/Draft Night)',
    releaseDate: 'Releases August 14, 2026',
    sellThrough: { flip: { range: 'scarcity premium day0', units: 'preorders OOS' }, hold: { range: '3-6× (12mo)', units: 'single print run' }, invest: { range: '3-6× (10× tail)', units: 'Tolkien IP' } },
    bulkBuy:  'buy before sellout', ebayFee: 0.13,
    writeup: {
      market:      '• **Thesis — strongest set hold:** Tolkien IP is the proven MTG moonshot — LOTR Tales CBB ~$150-era → $1400 (10-13×). Preorders ALREADY exhausted (CB/Bundle/Draft Night OOS) = single-print-run scarcity. Smaug Gleaming Gold (~500 copies) is the chase, but NOT serialized-One-Ring tier.\n• **Liquidity:** Highest-allocation previews of the slate (20+ at MagicCon LV) = WotC priority; strong FOMO, sold-out preorders. Deep sealed bid expected.\n• **Risk:** No serialized mega-chase = caps the 10× repeat. 2026 supply bloat (7 sets) fragments budget; Marvel (Jun 26) drains preorder capital 6wk prior.',
      product:     '• **Day0:** scarcity premium — CB box ~$144 trades up immediately on sold-out preorders.\n• **1-4wk:** holds/climbs on FOMO (no restock commitment).\n• **Onward (12mo):** base case 3-6× ($430-860 CBB); 10× only with a serialized/cultural catalyst (unlikely).\n• **Comp:** LOTR Tales CBB → $1400 (10-13× / 3yr). Prior SL x LOTR reprint drop = $0.38-0.92 (reprints DIE; full sets w/ unique cards appreciate).',
      priceComp: '', supplyDemand: '',
      recs:        '• 🟢 FULL SEND — buy sealed CB box before/at release; preorders already gone.\n• Tolkien IP = proven floor; hold 12mo+ for 3-6×.\n• Crack only if Smaug/Bilbo singles outrun sealed; otherwise hold sealed on scarcity.\n• Don’t expect LOTR’s 10× without a serialized chase — size for 3-6×.',
    },
  },
  'mtg-reality-fracture-set': {
    label:       'MTG Reality Fracture — Set + SL Echoverse Bundle',
    category:    'mtg',
    set:         'Magic: The Gathering / Original',
    retail:      89.99,
    retailNote:  'SL Echoverse Bundle MSRP $89.99 · set releases Oct 2, 2026 (bundle ships Oct 23)',
    releaseUrl:  'https://magic.wizards.com/en/products/reality-fracture',
    tcgId:       null, supplyScore: 16, liveMarket: null,
    ebayQuery:   'MTG Reality Fracture secret lair bundle',
    images:      [], forceRating: 'RED', risk: 'High', ebayFee: 0.13, preRelease: true,
    contents:    'Original (non-licensed) "Echoverse" theme — Jace reshapes Multiverse | SL Bundle $89.99: 6 Play + 2 Collector boosters, 2 of 10 randomized Echoverse mythics, 20 foil borderless lands, Spindown | mythic list NOT yet disclosed',
    releaseDate: 'Set Oct 2, 2026 · prerelease Sep 25 · bundle ships Oct 23',
    sellThrough: { flip: { range: 'SKIP (no premium)', units: 'fades' }, hold: { range: '-10-20% (wk2-4)', units: '$70-80 floor' }, invest: { range: 'SKIP', units: 'no anchor' } },
    bulkBuy:  'skip until mythic list', ebayFee: 0.13,
    writeup: {
      market:      '• **Thesis — original-IP fade, no anchor:** Non-licensed story-driven SLs average 15-25% BELOW MSRP by 30-60d unless a $30+ staple reprint anchors them. Mythic list undisclosed = unknown anchor. Strixhaven bundle $82→$54 echoes vanilla decay.\n• **Liquidity:** Tepid. ~2 IG reels, ~0 r/mtgfinance threads — original art draws no crossover fanbase. No pre-order velocity.\n• **Risk:** Bundle value diluted by depreciating boosters + low-value lands; net card value must clear ~$70-75 to hold floor, unproven w/ 2-of-10 randomized mythics. Print volume unknown — 50k+ units collapses floor.',
      product:     '• **Day0:** bundle ~MSRP $89.99, thin premium.\n• **1-4wk:** -10-20% as supply lands (~$70-80 floor).\n• **Onward:** flat/decline unless print run tight + chase reprint surfaces.\n• **Comp:** Back to School ’26 original SLs $2.60-13.60 value (worst-ever); original-art SLs floor 15-25% under MSRP w/o a staple anchor.',
      priceComp: '', supplyDemand: '',
      recs:        '• 🔴 NO SEND until the 10 Echoverse mythics are revealed.\n• Buy ONLY if a $30+ eternal-format staple reprint is in the list; else skip.\n• No flip window — original-IP bundles bleed post-delivery (Oct 23 ship floods supply).',
    },
  },
  'mtg-countdown-kit-2026': {
    label:       'MTG 2026 Countdown Kit',
    category:    'mtg',
    set:         'Magic: The Gathering / Secret Lair',
    retail:      199.99,
    retailNote:  'MSRP ~$199.99 (vs ’25 Encyclopedia) · listed Nov 9, 2026 — UNCONFIRMED on official roadmap',
    releaseUrl:  'https://magicsecretlair.com',
    tcgId:       null, supplyScore: 18, liveMarket: null,
    ebayQuery:   'MTG Secret Lair Countdown Kit',
    images:      [], forceRating: 'ORANGE', risk: 'Medium', ebayFee: 0.13,
    contents:    'Premium SL kit (comp: ’25 Encyclopedia of Magic, 26 A-Z reprints, $199.99, sold out in days) | eternal-format staples (Sol Ring etc.) | flash-sale, MagicSecretLair.com only | NOTE: not yet confirmed on WotC 2026 calendar (Nov 2026 = Star Trek set)',
    releaseDate: 'Listed Nov 9, 2026 (unconfirmed)',
    sellThrough: { flip: { range: 'flash-sellout ~MSRP', units: 'days' }, hold: { range: 'modest premium', units: 'staple-gated' }, invest: { range: '+40-90% (1-2yr)', units: 'if eternal staples' } },
    bulkBuy:  'slow hold', ebayFee: 0.13,
    writeup: {
      market:      '• **Thesis — slow appreciation, contents-gated:** Premium sealed SL kits hold/appreciate: 30th-Anniv Kit ’22 $149.99 → $284 (+90%, +3-5%/yr). Limited flash-sale supply. BUT awareness LOW and product UNCONFIRMED on the 2026 roadmap (Nov = Star Trek).\n• **Liquidity:** Flash-sellout creates scarce secondary, but muted demand vs licensed drops; eternal-staple weighting determines floor.\n• **Risk:** If budget-filler weighted like ’25 Encyclopedia (Sol Ring + commons), hype stays depressed. MagicSecretLair-only model frustrates buyers. Existence unverified.',
      product:     '• **Day0:** flash-sale sellout likely; entry ~MSRP.\n• **1-4wk:** modest premium if eternal-staple weighted.\n• **Onward:** +40-90% multi-year IF limited + eternal staples; muted if budget filler.\n• **Comp:** 30th-Anniv Kit ’22 → $284 (+90%). ’25 Encyclopedia sold out days, awareness low.',
      priceComp: '', supplyDemand: '',
      recs:        '• 🟠 LIGHT SEND — slow 1-2yr appreciation play, NOT a flip.\n• VERIFY existence on official WotC 2026 calendar before committing (Nov 2026 listed = Star Trek).\n• Buy only if card list skews eternal-format staples; pass if budget-common heavy.',
    },
  },
  'ac-black-flag-resynced-ce-ps5': {
    label:       "Assassin's Creed Black Flag Resynced Collector's Edition — PlayStation 5",
    category:    'noncard',
    set:         'Ubisoft Collector / Video Game CE',
    retail:      199.99,
    retailNote:  'MSRP $199.99 · verified Amazon B0GY5RPBFS · July 9, 2026',
    releaseUrl:  'https://www.amazon.com/dp/B0GY5RPBFS',
    tcgId:       null,
    supplyScore: null,
    liveMarket:  null,
    asin:        'B0GY5RPBFS',
    walmartItemId: 20107267128, // verified: Walmart item 20107267128 = AC Black Flag Resynced CE (URL slug is stale SEO text, not product identity)
ebayQuery:   "Assassin's Creed Black Flag Resynced Collector's Edition PS5",
    images:      [],
    risk:        'Medium',
    ebayFee:     0.13,
    releaseDate: 'July 9, 2026',
    forceRating: 'GREEN',
    forceRisk:   '🟡 Medium',
    contents:    "PS5 game disc | SteelBook | Edward Kenway figurine | Edward Kenway ring | collector's pin | poster | Master Assassin Character Pack (DLC) | Master Assassin Naval Pack (DLC) | Blackbeard's Crimson Pack (DLC pre-order bonus)",
    sellThrough: {
      flip:    { range: '$199.99 in → $300-330 flip = ~$61-88 net after fees', units: '1-2 units' },
      hold:    { range: 'SKIP — Ubisoft CEs restock post-launch, no long-term floor', units: 'N/A' },
      invest:  { range: 'SKIP — mass-produced CE, supply not capped', units: 'N/A' },
    },
    bulkBuy: '<10',
    evidence: [
      { source: 'Amazon B0GY5RPBFS (live)', date: '2026-06-26', point: 'MSRP $199.99 · PS5 Collector\'s Edition · confirmed in-stock at retail price · contents: SteelBook + Edward Kenway figurine + ring + pin + poster + DLC packs' },
      { source: 'Walmart.com live', date: '2026-06-26', point: '$199.99 in stock — confirms CE supply available at retail heading into Jul 9 release' },
      { source: 'eBay sold comps (pipeline)', date: '2026-06-26', point: 'eBay median $330.94 · 61 sold/30d · 176 sold/90d — real pre-launch secondary demand, 65% above MSRP; net flip ROI ~44% after 13% eBay fee' },
      { source: 'Ubisoft product page (ubisoft.com)', date: '2026-06-26', point: 'Release date July 9, 2026 · Black Flag Resynced = modern remake of AC4 · CE tier above Deluxe ($149.99) and Standard ($69.99) · pre-order bonus: Blackbeard\'s Crimson Pack' },
    ],
    writeup: {
      market:      '• **Thesis — FLIP WINDOW:** Black Flag is the most beloved AC title (pirate open-world, best Metacritic in the franchise) — nostalgia demand is real and the CE sells at a **65% premium** ($330 eBay median vs $199.99 retail). Walmart in stock at MSRP = buy friction is low, flip margin is legit. 61 sold/30d on eBay is strong pre-launch velocity for a $200 item.\n• **Risk cap:** Ubisoft historically restocks collector\'s editions post-launch (AC Valhalla, Mirage) — supply is not structurally capped. The $330 secondary floor is a pre-launch scarcity premium that compresses to $240-270 within 4-8 weeks as supply hits shelves. **Window = release week only.** Don\'t hold past launch week.\n• **Liquidity:** Solid 30d eBay velocity (61 sales), PS5-exclusive CE format = focused buyer pool, not cross-platform dilution.',
      product:     '• SteelBook + Edward Kenway figurine + ring + pin + poster = physical collectibles with standalone display value\n• DLC: Master Assassin Character Pack + Naval Pack + Blackbeard\'s Crimson Pack (pre-order bonus locked in)\n• Black Flag = highest-rated AC game — remake demand comes from original fans (PS3/360 era nostalgia + new-gen graphics upgrade)\n• CE is PS5-only physical — Xbox/PC versions separate SKUs, no cross-platform CE dilution',
      priceComp:   '• **Retail:** $199.99 (Amazon + Walmart in stock at MSRP)\n• **eBay secondary:** $330.94 median (61 sold/30d) — pre-launch scarcity premium\n• **Net flip:** $330.94 × 0.87 (eBay fee) − $199.99 = ~$88/unit at current median\n• **Closest comp:** AC Valhalla CE ($200 MSRP → $280-320 release week → $200-230 by month 2)\n• **AC Mirage CE ($170 MSRP):** peaked ~$220 launch week, fell back to ~$150 within 60 days',
      supplyDemand:'• Supply: Walmart + Amazon in stock at retail heading into July 9 — not structurally scarce, but CE allocation limits (~1-2/customer) throttle bulk buying\n• Demand: 176 eBay sold/90d, 8 X mentions, 4 Whatnot listings — pre-launch collector + nostalgia demand\n• Scarcity mechanic: CE is the top-tier SKU with physical figurine; Ubisoft does NOT make CE an unlimited restock (unlike standard editions) — but restocks DO happen 2-6 weeks post-launch at retailers\n• Compression risk: secondary floor compresses from $330 → $240-270 as retail restocks arrive, erasing the premium',
      recs:        '• 🟢 **SHORT TERM:** Buy 1-2 units at $199.99 (Walmart in stock) → flip on/before July 9 at $290-330 = ~$61-88 net/unit after fees\n• **Exit window:** List 3-5 days before release + day-of spike. Do NOT wait past launch week — Ubisoft restock compresses the premium within 2-4 weeks\n• **SKIP long hold:** AC CEs don\'t appreciate long-term (Ubisoft restocks kill the floor)\n• **Cap:** 1-2 units per person (retailer limits); thin margin at >2 units doesn\'t justify bulk exposure at $200/unit capital',
    },
  },
  'lego-zelda-deku-tree-77092': {
    label:       'LEGO The Legend of Zelda Great Deku Tree 2-in-1 (77092)',
    category:    'lego',
    set:         'LEGO The Legend of Zelda',
    retail:      299.99,
    retailVerified: true,
    retailNote:  'MSRP $299.99 · The Legend of Zelda · 2,500 pcs · 4 minifigs · RETIRED June 2026',
    releaseUrl:  'https://www.lego.com/en-us/product/the-great-deku-tree-2-in-1-77092',
    tcgId:       null, supplyScore: 10, liveMarket: null,
    ebayQuery:   'LEGO 77092 Great Deku Tree sealed new',
    images:      [], ebayFee: 0.13, forceRating: 'DBLGREEN', forceRisk: '🟢 Low',
    contents:    'LEGO 77092 Great Deku Tree 2-in-1 | 2,500 pcs | 4 minifigs: Princess Zelda + 3 Links (OoT, BotW, classic) | two display modes: Ocarina of Time or Breath of the Wild | Hylian Shield, Master Sword, Ocarina | Nintendo-licensed | RETIRED June 2026 after 21mo production run',
    releaseDate: 'Released Sep 2024',
    eolDate:     'Retired June 2026 (BrickEconomy confirmed — ALREADY RETIRED)',
    sellThrough: {
      flip:    { range: '$429-515 sealed-new TODAY (53% above retail, active listings)', units: 'sealed-new' },
      hold:    { range: 'hold 12-24mo → target $512-600 (16% CAGR, BrickEconomy 1yr projection $512)', units: 'sealed-new' },
      invest:  { range: '$600-700+ sealed (2-2.3× retail) by 2028 — Technic Porsche GT3 RS comp at $299.99 retail → 3.1×', units: 'sealed-new' },
    },
    bulkBuy: '5-10 units sealed-new at current $429-460 market',
    evidence: [
      { source: 'BrickEconomy (brickeconomy.com/set/77092-1)', date: '2026-06-28', point: 'Retired June 2026 after 21mo run. Current new-sealed $460 (53% above $299.99 retail). Active listings $429-$515. 1yr projection $512. CAGR 16.07%. Used $375-425. 57 offers.' },
      { source: 'BrickEconomy JSON-LD schema', date: '2026-06-28', point: 'offerCount:57, lowPrice:$300, highPrice:$473.79, InStock on secondary. "recently retired and should experience significant value increase in coming months" — BrickEconomy editorial.' },
      { source: 'set-history-lego.json DB comps', date: '2026-06-28', point: 'Best $299.99-retail comp: Technic Porsche GT3 RS → $929 (3.10×/17.2% CAGR). Licensed IP comps: Voltron ($179.99→$500, 2.78×/16.9%), Brick Bank ($169.99→$650, 3.82×/19.3%). Zelda = stronger IP than any.' },
    ],
    scenarios: [
      { label: 'Bear', prob: 15, text: 'LEGO announces Zelda reissue or new Zelda set cannibalizes demand. Market holds $400-460 range. Still 33-53% above retail but no major appreciation.' },
      { label: 'Base', prob: 55, text: 'Post-retirement 6-18mo cycle plays out per 16% CAGR. Exits $512-600 by mid-2027. Technic Porsche GT3 RS / Voltron comparable appreciation.' },
      { label: 'Bull', prob: 30, text: 'Nintendo Zelda cultural moment (new game release, anniversary) + supply depletion drives 3× retail. Exit $750-900 sealed by 2028. Brick Bank (3.82×) / GT3 RS (3.1×) comp.' },
    ],
    writeup: {
      market:      '• **Thesis — DBLGREEN: Just retired, 53% above retail, appreciation cycle starting NOW.** Deku Tree 77092 retired June 2026 — this month. At $460 sealed-new it\'s already 53% above retail with active listings $429-515. But the real appreciation hasn\'t started yet: post-retirement supply depletion + Nintendo IP demand push this toward Technic Porsche GT3 RS territory ($299.99 retail → $929, 3.1× / 17.2% CAGR) within 2-3 years.\n• **Why stronger than most comps:** Nintendo/Legend of Zelda is top-tier gaming IP (40th anniversary 2026, new game pipeline). 2-in-1 design (OoT + BotW) + 4 exclusive minifigs = dual-demographic collector appeal. No other LEGO Zelda display set at this scale exists. Single 21mo print run — hard supply cap starting now.\n• **Risk:** LEGO could release a follow-up Zelda set (71042-style successor) that absorbs demand. "Medium accuracy" BrickEconomy note = price data thin so early post-retirement.',
      product:     '• LEGO The Legend of Zelda 77092 | 2,500 pcs | 18+ display set\n• Two build modes: Great Deku Tree as Ocarina of Time (hollow interior with Navi, Kokiri\'s Emerald) or Breath of the Wild (autumnal colors, Guardian gear)\n• 4 minifigs exclusive: Princess Zelda + Link (OoT green tunic) + Link (BotW champion\'s tunic) + Link (classic) — Zelda minifig has high standalone collector value\n• Accessories: Hylian Shield, Master Sword, Ocarina of Time, Guardian Sword++ — completionist demand drivers\n• 21-month production run (Sep 2024 - Jun 2026) = limited total units vs. demand',
      priceComp:   '• MSRP: $299.99 (RETIRED — no more at retail)\n• Current sealed-new: $429-$515 range (BrickEconomy), center $460\n• Already 53% above retail at retirement — strong immediate premium\n• BrickEconomy 1yr projection: $512 (base case)\n• Comp 1 — Technic Porsche GT3 RS ($299.99 retail, retired): $929 NOW (3.10×/17.2% CAGR) — exact retail match, 5yr hold\n• Comp 2 — Ideas Voltron ($179.99, retired, licensed IP): $500 (2.78×/16.9% CAGR)\n• Comp 3 — Brick Bank ($169.99, retired): $650 (3.82×/19.3% CAGR) — highest CAGR at $150 tier\n• Zelda has stronger IP pull than all 3 comps',
      supplyDemand:'• Supply: Hard-capped at June 2026 retirement. Retail sellthrough happening now (remaining Target/Walmart inventory burning off, eBay sellers sourcing at retail while they can). Within 3-6mo, sealed-new supply exclusively secondary market — no restock.\n• Demand: Zelda = Nintendo\'s 2nd-biggest franchise. 40th anniversary 2026. Active game franchise (Tears of the Kingdom momentum, next Zelda in pipeline). Adult LEGO collector + gaming/Zelda fan crossover = two buying pools. Exclusive Princess Zelda minifig = standalone bid.\n• Trend: 57 active secondary offers, $300-473 range — price discovery actively running upward. BrickEconomy flags "significant value increase in coming months."',
      recs:        '• 🟢🟢 DBLGREEN — buy sealed-new NOW at $429-460 market. Window: next 2-4 months before post-retirement supply tightens.\n• Entry: $429-460 secondary (eBay sealed listings), or retail if any remain at $299.99 (immediate 53% gain).\n• Hold 12-24mo; target exit $512-600 (base) or $750-900 (bull if Nintendo moment).\n• 5-10 units sealed-new. Mint condition only — display sets = condition-sensitive.\n• Do NOT open. The two build modes = display appeal that keeps sealed premium high.',
    },
  },

  'lego-ideas-jaws-21350': {
    label:       'LEGO Ideas Jaws (21350) — Orca Boat + Brody/Hooper/Quint',
    category:    'lego',
    set:         'LEGO Ideas',
    retail:      149.99,
    retailVerified: true,
    retailNote:  'MSRP $149.99 · LEGO Ideas · released Aug 6, 2024 · 1,497 pcs · retires Jul 31, 2026',
    releaseUrl:  'https://www.lego.com/en-us/product/jaws-21350',
    tcgId:       null, supplyScore: 16, liveMarket: null,
    ebayQuery:   'LEGO Ideas Jaws 21350 sealed',
    images:      [], risk: 'Medium', ebayFee: 0.13, forceRating: 'GREEN', forceRisk: '🟡 Medium',
    contents:    'LEGO Ideas Jaws diorama: Orca boat (59cm), 3 minifigs (Brody/Hooper/Quint), shark | 1,497 pcs | strong-IP licensed film (Universal/Amblin) | Matt Hooper minifig EXCLUSIVE | single print run, EOL Jul 31 2026',
    releaseDate: 'Released Aug 6, 2024',
    eolDate:     'Jul 31, 2026 (BrickFanatics exact — 33 days out)',
    sellThrough: {
      flip:    { range: 'SKIP flip now — market $133-142 vs retail $149.99 = negative margin', units: 'n/a' },
      hold:    { range: 'buy $120-150 sealed-new → target $300-477 post-EOL 1-3yr', units: 'sealed-new' },
      invest:  { range: '$300-477 (2-3× retail, comp: Old Fishing Store 21332 → 3.18×)', units: 'sealed-new' },
    },
    bulkBuy:  'accumulate sealed-new at/below retail before Jul 31',
    evidence: [
      { source: 'BrickEconomy JSON-LD (brickeconomy.com/set/21350-1)', date: '2026-06-28', point: 'MSRP $149.99, retires mid/late 2026, current sealed-new $120.99-$157.49, 43 offers, description confirms exclusive Matt Hooper minifig' },
      { source: 'set-history-lego.json DB + BrickFanatics', date: '2026-06-28', point: 'retireExact 2026-07-31, status active-retiring, CAGR 5%, ATH $580, current secondary $133, Old Fishing Store (same $149.99 retail) retired → $477 / 3.18× comp' },
      { source: 'Pipeline live market', date: '2026-06-28', point: 'eBay median $149.99 (48 active), StockX $126 (ask $145/bid $107), Amazon $149.99 in stock, weighted market $141.99 — confirms at/below retail pre-EOL, no flip margin today' },
    ],
    scenarios: [
      { label: 'Bear', prob: 20, text: 'LEGO extends production or does Jaws Ideas refresh. Market stays $120-150 through 2027. Exit below retail.' },
      { label: 'Base', prob: 60, text: 'EOL Jul 31 sticks. Post-retirement Ideas appreciation kicks in 6-12mo out. Exits $270-350 sealed (1.8-2.3×) by mid-2027. Old Fishing Store / Apollo Saturn V comp range.' },
      { label: 'Bull', prob: 20, text: 'Strong licensed-IP demand (Jaws = cultural icon) + exclusivity of 3 minifigs drives 3× appreciation like Old Fishing Store ($477). Exit $400-500 sealed by 2028.' },
    ],
    writeup: {
      market:      '• **Thesis — HOLD BUY:** EOL is Jul 31, 2026 — 33 days out. Window to accumulate at/near retail is closing. Best comp: Old Fishing Store (21332, same $149.99 retail, retired) → $477 sealed today (3.18×/16.4% CAGR). Jaws has STRONGER licensed IP (Universal/Amblin iconic film vs. generic fishing store) and exclusive minifigs — should track Old Fishing Store or better post-EOL.\n• **Liquidity:** AFOL + licensed-film collector dual demand. Exclusive Matt Hooper minifig = sealed anchor. Secondary market already starting to tighten ($120-157 range per BrickEconomy, 43 active offers down from typical pre-EOL flood).\n• **Risk:** Production extends past Jul 31 (LEGO has done this before). Current market $133-142 = below retail → no flip today; hold play only. Amazon $149.99 in-stock means still purchasable at retail for 33 more days.',
      product:     '• LEGO Ideas 21350 (fan-voted film set) | 1,497 pcs | Orca boat display (59cm) + Brody, Hooper, Quint minifigs | Great White shark fig\n• Matt Hooper minifig EXCLUSIVE to this set — collector demand anchor; no other LEGO Jaws set exists\n• Licensed IP: Universal/Amblin Jaws (1975, 50th anniversary 2025) = strong cultural-nostalgia pull from AFOL adults 35-60 demographic\n• Single print run — no rereleases once EOL; supply hard-caps at existing inventory',
      priceComp:   '• MSRP: $149.99 (Amazon/LEGO in stock)\n• Current sealed-new (BrickEconomy): $120.99-$157.49 (at/below retail pre-EOL)\n• Market weighted: ~$142 (eBay $150, StockX $126)\n• Comp 1 — Old Fishing Store 21332 ($149.99 retail): retired → $477 NOW (3.18×/16.4% CAGR) — EXACT retail match\n• Comp 2 — Voltron 21303 ($179.99): retired → $500 (2.78×/16.9% CAGR) — licensed IP, similar profile\n• Comp 3 — Apollo Saturn V 21309 ($119.99): retired → $280 (2.3×/27.4% CAGR) — NASA licensed\n• DB ATH (Jaws): $580 — 3.87× retail (spike/moment of scarcity)',
      supplyDemand:'• Supply: EOL Jul 31 ends production; Amazon still at retail = supply available for 33 more days then hard-caps. BrickEconomy shows 43 active offers — still liquid for accumulation, not yet scarce.\n• Demand: Two buyer pools: (1) AFOL set collectors (Ideas fan-voted, licensed IP), (2) Jaws film fans/nostalgia buyers. 50th anniversary of Jaws (1975) = 2025 cultural moment boosted awareness. Exclusive Hooper minifig adds completionist demand.\n• Post-EOL mechanics: sealed supply shrinks as sets get built/opened; new-sealed premium grows 6-18mo post-retirement. Ideas theme consistently shows 15-30% appreciation 12mo after EOL for licensed sets.',
      recs:        '• 🟢 GREEN — hold buy, accumulate sealed-new at/below $149.99 retail before Jul 31, 2026.\n• Entry NOW (33 days left): buy at retail $149.99 on Amazon or secondary $120-135 if available.\n• Exit: 12-24mo post-EOL (mid-2027 to mid-2028); target $300-477 based on Old Fishing Store / Voltron comps.\n• Do NOT flip immediately — current market $133-142 is below cost basis.\n• Mint sealed only; store climate-controlled; don\'t open.',
    },
  },
  'lego-ideas-stem-21355': {
    label:       'LEGO Ideas The Evolution of STEM (21355) — Carver/Curie/Newton',
    category:    'noncard',
    set:         'LEGO Ideas',
    retail:      79.99,
    retailNote:  'MSRP $79.99 · LEGO Ideas No. 63 · released Mar 1, 2025 · 879 pcs',
    releaseUrl:  'https://www.lego.com/en-us/product/the-evolution-of-stem-building-set-with-scientist-minifigures-21355',
    tcgId:       null, supplyScore: 36, liveMarket: null,
    ebayQuery:   'LEGO Ideas Evolution STEM 21355',
    images:      [], risk: 'Medium', ebayFee: 0.13, forceRating: 'ORANGE',
    dxQuery:     'LEGO 21355',
    contents:    'LEGO Ideas The Evolution of STEM | 879 pcs | 3 exclusive minifigs: George Washington Carver, Marie Sklodowska-Curie, Sir Isaac Newton | active-retiring, projected EOL mid-2027 | no licensed IP (fan-voted STEM design)',
    releaseDate: 'Released Mar 1, 2025',
    eolDate:     'mid-2027 (BrickEconomy projection)',
    sellThrough: {
      flip:    { range: 'SKIP — $60-84 current (at/below retail, no margin pre-EOL)', units: 'none' },
      hold:    { range: 'buy $60-80 sealed → target $95-115 post-EOL mid-2027', units: 'sealed-new' },
      invest:  { range: '~$85-95 by late 2027 (6% CAGR, weak-tier Ideas hold)', units: 'sealed-new' },
    },
    bulkBuy:  'hold only — no bulk flip play pre-EOL',
    evidence: [
      { source: 'BrickEconomy (brickset.com)', date: '2026-06-22', point: 'MSRP $79.99, 879 pcs, released Mar 1 2025, LEGO Ideas No. 63, projected EOL mid-2027, active-retiring status' },
      { source: 'BrickEconomy DB (set-history-lego.json)', date: '2026-06-22', point: 'Current sealed-new range $60-$83.99 (at/below retail), 6% CAGR forecast, 36 active offers, invClass WATCH — weakest Ideas appreciation tier' },
      { source: 'Pipeline live market', date: '2026-06-22', point: 'eBay median $61.95 (47 active), Walmart $78.97 in stock, Amazon $82.99 in stock, StockX ask $80, weighted market $67.97 — confirms no flip margin pre-EOL' },
    ],
    writeup: {
      market:      '• **Thesis — ORANGE/WATCH:** Active-retiring Ideas set with no licensed IP. Currently trades $60-84 sealed-new (BrickEconomy), AT OR BELOW retail — consistent with LEGO pre-EOL suppression. No flip margin now. Only play is a post-EOL hold.\n• **vs. comparable Ideas sets:** Best performer comps at $79.99 retail: Seinfeld 21328 → +89%/19.6% CAGR (strong licensed IP, 16mo run); Family Tree 21346 → +0%/2.3% CAGR (original IP, same retail). DB-forecast 6% CAGR puts 21355 firmly in the Family Tree/Pop-Up Book bottom tier — not the licensed-IP tier.\n• **Risk:** No licensed anchor (Seinfeld, Winnie the Pooh, NASA = demand magnets post-EOL; STEM/educational = niche). Minifig exclusivity (Carver/Curie/Newton) adds SOME collector bid but can\'t substitute real IP. With 36 active offer listings still at/below retail, supply is not constrained yet.',
      product:     '• LEGO Ideas No. 63 (fan-voted STEM competition winner), 879 pcs, 18+.\n• 3 minifigs EXCLUSIVE to this set: George Washington Carver, Marie Curie, Isaac Newton — best demand driver given no licensed IP.\n• Mechanic = single print run → retires mid-2027 → sealed supply caps → modest appreciation begins post-EOL.\n• Weak appreciation tier (C/6% CAGR) — BrickEconomy classes as WATCH, not BUY; wait for EOL confirmation to accumulate.',
      priceComp:   '• Retail MSRP: $79.99\n• Current sealed-new (BrickEconomy): $60-84 (at/below retail — no flip margin)\n• Post-EOL projection: $95-115 sealed (~6% CAGR from retail basis)\n• Comp 1 (same retail $79.99, original IP): Family Tree 21346 → $80 NOW (+0%, 2.3% CAGR, 22mo run) — weakest Ideas hold\n• Comp 2 (same retail, strong IP): Seinfeld 21328 → $151 NOW (+89%, 19.6% CAGR, 16mo) — licensed IP = massive premium\n• Comp 3 (STEM-adjacent, AFOL/science demand): NASA ISS 21321 ($69.99) → $138 (+98%, 21% CAGR) — NASA brand > generic STEM',
      supplyDemand:'• Supply: Single print run, active-retiring; 36 active offer listings = ample pre-EOL supply; no supply constraint until retirement confirmed.\n• Demand: STEM/educational niche = smaller AFOL collector pool vs. licensed or pop-culture sets. Scientist minifig exclusivity (Carver/Curie/Newton) is the demand lever — trades on completionist/education-collector segment, NOT mass AFOL/licensed IP demand.\n• Absorption: DB at/below retail with 36 offers = market is NOT absorbing at retail pace; weak buy-side pressure pre-EOL.',
      recs:        '• 🟠 ORANGE — weak hold, not a flip. Only entry if you can buy below $75 sealed-new.\n• Hold to post-EOL mid-2027; realistic exit $95-115 (6% CAGR, modest).\n• DO NOT bulk buy at retail ($79.99) — current market is $60-84 and no appreciation pre-EOL.\n• Compare: if budget limited, Jaws 21350 (retiring Jul 2026, stronger licensed IP) or NASA ISS 21321 (retired, already appreciating 21% CAGR) are better Ideas holds.',
    },
  },
  'lego-icons-porsche-911-10295': {
    label:       'LEGO Icons Porsche 911 (10295) — 2in1 Turbo/Targa',
    category:    'noncard',
    set:         'LEGO Icons',
    retail:      169.99,
    retailNote:  'MSRP $169.99 · LEGO Icons · ACTIVE (retires mid/late 2026) · 1,458 pcs',
    releaseUrl:  'https://www.lego.com/en-us/product/porsche-911-10295',
    tcgId:       null, supplyScore: 20, liveMarket: null,
    ebayQuery:   'LEGO Icons Porsche 911 10295',
    images:      [], risk: 'Medium', ebayFee: 0.13, forceRating: 'GREEN',
    retail2:     99, dealNote: 'Walmart+',
    contents:    'LEGO Icons Porsche 911 2in1 (build Turbo OR Targa) | 1,458 pcs | ACTIVE retail, projected retirement mid/late 2026 | proven LEGO car-model appreciation line',
    releaseDate: 'Released 2021',
    eolDate:     '~July 31, 2026 (BrickFanatics exact date)',
    sellThrough: { flip: { range: '$99 in → $149-180 sealed (+50-82%)', units: 'WM+ deal flip' }, hold: { range: 'hold past mid/late-2026 EOL', units: 'sealed-new' }, invest: { range: '~$207-219 (+7% CAGR post-retire)', units: 'on top of deal' } },
    bulkBuy:  'buy WM+ $99, flip/hold',
    writeup: {
      market:      '• **Thesis — BUY: Walmart+ $99 = the edge.** Tonight\'s WM+ special is $99, 42% under $169.99 MSRP and below the BrickEconomy NEW-SEALED floor ($149-180). At $99 cost, sealed-new resale = ~+50-82% NOW. Set RETIRES mid/late 2026 → ~7% CAGR stacks on top (forecast ~$207-219). Porsche 911 = flagship Icons car, the line\'s most reliable post-retirement performer — a deep discount here is the best-case LEGO entry.\n• **Liquidity:** Very high — one of the most liquid sealed LEGO sets; deep AFOL + Porsche-fan crossover bid.\n• **Risk:** WM+ quantity caps; mint sealed box only; resale comp = BrickEconomy new-sealed, NOT the $129 used-dragged eBay median.',
      product:     '• LEGO Icons (18+) flagship 2in1 (Turbo or Targa), 1,458 pcs.\n• Mechanic = retirement scarcity; pre-EOL discounts, post-EOL (mid/late 2026) climbs.\n• Porsche/Icons car line = among LEGO\'s most reliable holds; ~7% CAGR forecast.\n• Buy on the current sub-retail dip ($149 sealed-new); the discount IS the edge.',
      priceComp: '', supplyDemand: '',
      recs:        '• 🟢 BUY the Walmart+ $99 special — 42% off MSRP, below the $149+ sealed-new floor = ~+50-82% on resale alone.\n• Flip sealed-new ($149-180) now, OR hold past mid/late-2026 EOL → ~$207-219 (+7% CAGR) on top.\n• Buy to the WM+ quantity cap; mint sealed box only.\n• Resale comp = BrickEconomy new-sealed, NOT the $129 used-dragged eBay median.',
    },
  },
  'needoh-jelly-squish': {
    label:       'NeeDoh Jelly Squish Stress Ball (1 Random Color)',
    category:    'noncard',
    set:         'Schylling / NeeDoh Sensory Toys',
    retail:      7.99,
    retailNote:  'MSRP ~$6.99-7.99 · Schylling · single random color',
    releaseUrl:  'https://www.walmart.com/ip/NeeDoh-Jelly-Squish-Stress-Ball-1-RANDOM-Color/19536452232',
    walmartItemId: '19536452232',
    tcgId:       null, supplyScore: 30, liveMarket: null,
    ebayQuery:   'NeeDoh Jelly Squish Stress Ball',
    images:      [], risk: 'High', ebayFee: 0.13,
    contents:    'One NeeDoh Jelly Squish jellyfish stress ball, random color | Schylling sensory/fidget line | mass-retail toy, ages 3+',
    releaseDate: 'In production — ongoing retail SKU',
    sellThrough: { flip: { range: '$13 – $16 (OOS window now)', units: '6-12 unit lots' }, hold: { range: '$8 – $15 (OOS-cyclical, reverts on restock)', units: 'time next OOS spike' }, invest: { range: 'SKIP', units: 'no scarcity floor' } },
    bulkBuy:  'lot-flip only',
    writeup: {
      market:      '• **Thesis — viral demand, but zero scarcity:** NeeDoh is a hot sensory-toy line (Schylling paused new orders on demand) but the Jelly Squish is a mass-produced, perpetually-restocked $7 retail SKU. No print cap, no exclusivity = no sealed-appreciation thesis. Any margin is retail-arb / out-of-stock-window flipping, not a hold.\n• **Liquidity:** High velocity on eBay/Amazon as multi-unit lots; single-unit flips lose to $5-6 shipping. Real money is bulk (lots of 6-12) into OOS windows.\n• **Risk:** Restock kills premium fast; thin per-unit margin; shipping eats single sales; commodity item with dozens of near-identical NeeDoh SKUs competing.',
      product:     '• Single random-color jellyfish squish — pure impulse/sensory toy, no collector base.\n• Value only when mainstream retail is OOS and demand spikes (TikTok/seasonal); reverts to MSRP on restock.\n• Flip vehicle = multi-packs/lots, not singles. Margin is volume × small spread.\n• Verify live Walmart/Amazon stock — if at/near $7.99 retail, no flip.',
      priceComp: '', supplyDemand: '',
      recs:        '• 🟠/🔴 retail-arb ONLY — buy below MSRP in bulk, flip lots during OOS windows.\n• No hold/invest thesis: mass-produced, restocked, commodity.\n• Single-unit eBay flips die to shipping; sell as 6-12 lots.\n• Skip entirely if Walmart/Amazon in stock at retail.',
    },
  },
  'okami-datadiscs-vinyl': {
    label:       'Ōkami Original Soundtrack — Data-Discs 4xLP Frosted Clear Box Set',
    category:    'noncard',
    set:         'Video Game Vinyl / Data-Discs',
    retail:      120,
    retailNote:  'MSRP £94.99 (~$120) · Data-Discs · SOLD OUT (secondary only)',
    releaseUrl:  'https://data-discs.com/products/okami?variant=12539455602773',
    tcgId:       null,
    supplyScore: 26,
    liveMarket:  null,
    ebayQuery:   'Okami Data-Discs vinyl 4xLP box set',
    images:      [],
    imageUrl:    'https://data-discs.com/cdn/shop/products/OKAMI_Cover_1200x1200.jpg?v=1533068711',
    contents:    '4×LP Frosted Clear box set | Ōkami (Capcom) original soundtrack | Data-Discs deluxe pressing — heavyweight, gatefold/booklet | SOLD OUT at source',
    releaseDate: 'Data-Discs release | now OOP / sold out',
    sellThrough: {
      flip:   { range: 'market-driven', units: 'secondary only' },
      hold:   { range: 'market-driven', units: 'secondary only' },
      invest: { range: 'market-driven', units: 'secondary only' },
    },
    bulkBuy:  'secondary only — OOP',
    risk:     'Medium',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis:** Data-Discs is the blue-chip video-game-vinyl label, and Ōkami is one of its most coveted titles — a beloved Capcom OST + striking sumi-e art on a 4×LP frosted-clear deluxe box, now SOLD OUT at source. OOP Data-Discs sets are reliable appreciators; flagship titles (Streets of Rage, Shenmue, Ico) routinely trade **2–4× MSRP** on the secondary. Demand spans VGM collectors + Ōkami fans + audiophile-vinyl buyers.\n• **Liquidity:** Healthy for a niche — Discogs/eBay see steady VGM-vinyl turnover; sealed first-press deluxe sets are the premium tier and clear quickly at the right price.\n• **Risk:** Condition-sensitive (box/seam/warp) and Discogs is the true price oracle (pipeline uses eBay, so cross-check Discogs); a Data-Discs REPRESS would cap upside, so confirm OOP status. Sealed holds; opened trades at a discount.',
      product:     '• 4×LP Frosted Clear box set — Data-Discs deluxe format (heavyweight, gatefold + booklet)\n• Ōkami (Capcom) original soundtrack; sumi-e cover art is a key collector draw\n• Sold out at source = secondary-only; first-press sealed is the premium tier\n• Keep shrink + box corners clean; warps/seam-splits gut value on heavy box sets',
      priceComp:   '',
      supplyDemand:'',
      recs:        '• **Cost basis ref ~$130** ($120 + ~8% tax) if bought near MSRP — but it\'s OOP, so entry is secondary\n• Targets + net/ROI live from pipeline comps — cross-check Discogs (true vinyl oracle)\n• Buy SEALED first-press; flip on Ōkami/Data-Discs hype or hold OOP scarcity\n• Watch for a repress announcement — would compress the premium',
    },
  },
  'taylor-toystory-vinyl-set': {
    label:       'Taylor Swift "I Knew It, I Knew You" 10" Vinyl SET — Sheriff Badge + Jessie\'s Hat',
    category:    'noncard',
    set:         'Toy Story 5 / Disney·Pixar',
    retail:      49.98,
    retailNote:  'MSRP $49.98 (2 × $24.99) · Disney·Pixar · 24-hr limited drop (Jun 2026)',
    releaseUrl:  'https://storeuk.taylorswift.com/products/i-knew-it-i-knew-you-10-vinyl-jessie-s-hat',
    tcgId:       null,
    supplyScore: 24,
    liveMarket:  null,
    ebayQuery:   'Taylor Swift I Knew It I Knew You 10 vinyl set sheriff badge jessie hat',
    images:      [],
    contents:    'Both 10" shaped picture discs — Jessie\'s Hat + Sheriff Badge | Side A "I Knew It, I Knew You" / Side B instrumental | 24-hr limited Disney·Pixar drop | complete-set pairing',
    releaseDate: 'Jun 2026 | 24-hr limited drop',
    sellThrough: {
      flip:   { range: 'market-driven', units: 'secondary only' },
      hold:   { range: 'market-driven', units: 'secondary only' },
      invest: { range: 'SKIP',          units: 'N/A' },
    },
    bulkBuy:  'secondary only — 24-hr drop',
    risk:     'Medium',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis:** Same crossover engine as the single (Swift 90M+ fanbase × Disney/Pixar × Toy Story 5) but the SET carries a completionist premium — both shaped picture discs (Jessie\'s Hat + Sheriff Badge) from a 24-hr-capped drop, no reprint. Matched pairs of Swift limited vinyl historically out-flip singles because collectors pay up to avoid hunting the second piece. Standard Swift variants flip $80–150 each; a sealed complete set should clear a premium to 2× single.\n• **Liquidity:** Strong dual fanbase + film tie-in = deep demand vs hard-capped supply; sets clear fast in the first weeks. Theatrical launch is a second demand wave on fixed supply.\n• **Risk:** Front-loaded — Swift-vinyl premiums peak the first 1–2 weeks then soften; shaped picture discs are condition-sensitive (bend/seal) and a SET doubles that exposure (both must be mint). Flip fast.',
      product:     '• Two 10" shaped picture discs — Jessie\'s Hat + Sheriff Badge; complete matched set\n• Side A original song + Side B instrumental; first Swift song for a Pixar film\n• 24-hr drop, no reprint; sealed both-mint set is the premium tier\n• Both discs must be sealed/un-bent — one damaged piece breaks the set premium',
      priceComp:   '',
      supplyDemand:'',
      recs:        '• **Cost basis ~$54** ($49.98 + ~8% tax) | eBay 13% fee\n• Targets + net/ROI live from pipeline comps — see embed\n• Sell as a SEALED SET for the completionist premium; don\'t split unless singles price higher\n• Flip in first 1–2 weeks — Swift-vinyl premium is front-loaded',
    },
  },
  'taylor-jessie-hat-vinyl': {
    label:       'Taylor Swift — "I Knew It, I Knew You" 10" Vinyl (Jessie\'s Hat)',
    category:    'noncard',
    set:         'Toy Story 5 / Disney·Pixar',
    retail:      24.99,
    retailNote:  'MSRP · Disney·Pixar · 24-hr limited drop (Jun 2026)',
    releaseUrl:  'https://storeuk.taylorswift.com/products/i-knew-it-i-knew-you-10-vinyl-jessie-s-hat',
    tcgId:       null,
    supplyScore: 22,
    liveMarket:  null,
    ebayQuery:   'Taylor Swift I Knew It I Knew You 10 Vinyl Jessie Hat Toy Story 5',
    images:      [],
    contents:    '10" shaped picture disc (Jessie\'s Hat) | Side A "I Knew It, I Knew You" / Side B instrumental | 24-hr limited Disney·Pixar drop | sister variant = Sheriff Badge',
    releaseDate: 'Jun 2026 | 24-hr limited drop',
    sellThrough: {
      flip:   { range: '$60 – $110',  units: '~20 – 40 units' },
      hold:   { range: '$90 – $160',  units: '~10 – 20 units' },
      invest: { range: '$130 – $220', units: '~5 – 10 units' },
    },
    bulkBuy:  '~20 – 40 units',
    risk:     'Medium',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis:** Taylor Swift limited vinyl is one of the most reliable flip vehicles in collectibles — drops routinely clear 3–6× MSRP same-week as a 90M+ fanbase chases a 24-hr-capped pressing. This one stacks a second fanbase (Disney/Pixar + Toy Story 5 tie-in) and low shaped-disc pressing yield, widening demand well beyond Swifties with no reprint path. Standard Swift variants flip $80–150 on $25 MSRP — the crossover should match or beat that.\n• **Liquidity:** 76 eBay solds in 30 days at ~4× MSRP — proven, liquid demand before the film even releases; theatrical launch is a second demand wave on fixed supply.\n• **Risk:** Premium is front-loaded — Swift-vinyl peaks the first 1–2 weeks then softens as secondary fills; shaped picture discs are condition-sensitive (bend/seal). Flip fast.',
      product:     '• 10" shaped picture disc — display collectible, not a play-grade record; condition/sealed status is the value driver\n• Side A original song + Side B instrumental; first Swift song for a Pixar film\n• Shaped/picture-disc format = lower pressing yield than standard black vinyl = scarcer\n• Sealed + un-bent shipping is the grading risk for shaped discs',
      priceComp:   '• MSRP $24.99 | secondary comps pulled live via pipeline (eBay/Amazon/Walmart)\n• Comparable Swift limited vinyl drops: $25 MSRP → $80–150 within first week\n• Sealed first-press is the premium tier; opened/displayed discs trade at a discount',
      supplyDemand:'• Supply fixed by 24-hr window — no reprint path once closed\n• Demand stacks two fanbases that rarely overlap on one SKU (Swifties + Disney collectors)\n• Film release cadence (Toy Story 5) provides a second demand wave at theatrical launch\n• Flip window is immediate — scarcity premium is highest in first 1–2 weeks post-drop',
      recs:        '• **Cost basis: ~$27** ($24.99 + ~8% tax) | eBay 13% fee on sale\n• Secondary targets + net/ROI computed live from pipeline comps — see embed fields\n• Keep SEALED — shaped picture discs lose 30–50% value opened/bent\n• Flip fast: Swift-vinyl premiums are front-loaded; first 2 weeks = peak',
    },
  },
  'chrome-bball-hobby-2026': {
    label:       '2026 Topps Chrome Baseball Hobby Box',
    category:    'topps',
    set:         'Topps Chrome',
    retail:      240,
    retailNote:  'Hobby preorder $240 (2026; +20% vs 2025 $200) · jumbo ~$450 · releases 7/22/26',
    releaseUrl:  'https://www.topps.com/pages/topps-chrome-baseball',
    tcgId:       null, supplyScore: 9, liveMarket: null, preRelease: true, forceRating: 'ORANGE',
    evidence: [
      { source: '#card-flips (.ml_) 722968137687105596', date: '2026-06-22', point: '2026 hobby preorder $240 (last yr $200); 2025 path $200→$275 release→$200 Sept→$160 late-yr; jumbo $400→$525→$350' },
      { source: 'topps.com preorder page', date: '2026-06-22', point: '2026 Chrome Baseball preorder live 6/22 12pm ET; hobby 20pk×4, 1 auto/box, 300-card base' },
      { source: 'eBay sold + StockX (pipeline)', date: '2026-06-22', point: 'live secondary eBay $233 median (50 active) / StockX $335 — release-window asks, not a held floor' },
      { source: 'checklistinsider.com', date: '2026-06-22', point: 'SuperFractor chase = Jacob Misiorowski RC; standard Chrome parallel ladder /199 → /99 → /50 → /25 → /5 → 1/1' },
    ],
    presaleMarket: '$240–290 (preorder/release pop)',
    profitNow:   '🟡 ~$0–25/unit | $260–290 release-day flip (cost ~$259 w/ tax) — thin',
    profitLong:  '🔴 ~-$60 to -$90/unit | decays to $160–200 by fall (below MSRP) — DO NOT HOLD',
    ripEV:       'Avg rip-EV ~$130–170/box (1 auto ~$25–60 + Refractor RC singles) **< $240 cost** → sealed is rich to contents; rip only to chase a specific RC (Misiorowski SuperFractor), otherwise the box loses on a hold.',
    scenarios:   '**Bear** (post-Sept, fills land): **$160** — below MSRP, last-yr path.\n**Base** (settles to retail by fall): **~$200**.\n**Bull** (release-week pop / RC hits): **~$275** — fades fast.\nProb-weighted ≈ **$205** (≤ the $240 cost) → flip release week or skip.',
    ebayQuery:   '2026 Topps Chrome Baseball Hobby Box',
    images:      [],
    imageUrl:    'https://cdn11.bigcommerce.com/s-cft20qcvqs/images/stencil/1280x1280/products/13168/441663/2026-topps-chrome-baseball-hobby-box__06318.1762579664.jpg',
    contents:    'Hobby box: 20 packs × 4 cards = 80 cards | 1 autograph/box | 300-card base set (loaded rookie class) | Refractors + retro-theme inserts | HOBBY = no reprint (fixed run)',
    boxConfig:   { cardsPerBox: 80, autosPerBox: 1 },
    releaseDate: 'Pre-order 6/22/26 · releases 7/22/26',
    sellThrough: {
      flip:   { range: '$260 – $290 (RELEASE WEEK only)', units: 'sell day-0, before fills land' },
      hold:   { range: '$160 – $200 (decays < MSRP)',     units: 'do not hold — loses' },
      invest: { range: 'SKIP',                            units: 'high-print, no floor' },
    },
    bulkBuy:  'release-week flip only',
    risk:     'High',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis — flip the release window, do NOT hold.** Chrome Baseball is high-print; even though Hobby doesn\'t reprint, supply is large enough that it bleeds BELOW MSRP. Last yr: preorder $200 → release **$275** → held ~$250 a week → Sept ≈ retail $200 → **then under MSRP to $160** (jumbo $400→$525→$350). 2026 repeats the path off a HIGHER $240 cost (+20%), so margin is thinner. Edge = release-day pop only — release-day sales beat the week-after, when preorder fills flood the market.\n• **Catalyst:** Drops right before **The National** (late July) = short-term demand support that props the release window; that prop fades within weeks.\n• **Risk:** Holding = a loss (decays below the $240 cost). Only break in the pattern = a marquee RC (Misiorowski SuperFractor) carrying singles — contents, not sealed, is where any real money is. Price hike makes 2026 worse than 2025, not better.',
      product:     '• **Config:** 20 packs × 4 = 80 cards/box · 1 on-card auto/box · 300-card base (loaded RC class). Hobby case = 12 boxes.\n• **Parallel/odds ladder** (standard Chrome; confirm vs odds sheet at release): Refractor (base chrome) → #\'d Aqua /199 → Green /99 → Gold /50 → Orange /25 → Red /5 → **SuperFractor 1/1**. ~1 numbered parallel + 1 auto per box; SuperFractor ≈ 1:case-level lottery.',
      priceComp:   '• 2026 preorder: **$240 hobby** (+20% vs 2025 $200) · jumbo ~$450.\n• 2025 full trajectory (the real anchor): preorder $200 → release **$275** → ~$250 (wk1) → ~$200 by Sept → **$160 by late year** (under MSRP). Jumbo $400→$525→$350.\n• Live secondary: eBay $233 median · StockX $335 — release-window asks, not a sustained floor.',
      supplyDemand:'• High-print flagship — large supply means no-reprint does NOT create a price floor (bleeds below MSRP).\n• Release-day > week-after: preorder fills land within days and push price down.\n• The National (late July) gives a short prop into release; fades fast.\n• Real money is in CONTENTS (top-RC Refractors / Misiorowski SF), not sealed boxes.',
      recs:        '• 🟠 LIGHT SEND — buy ONLY to flip the release week ($260–290); sell day-0/1.\n• DO NOT HOLD — last yr decayed to $160 (below MSRP); 2026 starts at a higher $240 cost = worse.\n• Alt-play: rip for Misiorowski / top-RC Refractors + sell the auto.\n• Jumbo (~$450) follows the same path ($525→$350); same flip-only logic.',
    },
  },
  'chrome-fb-value-2025': {
    label:       '2025 Topps Chrome Football Value Box (Blaster)',
    category:    'topps',
    set:         'Topps Chrome',
    retail:      39.99,
    retailNote:  'MSRP · retail value/blaster · released 4/15/26',
    releaseUrl:  'https://www.gamestop.com/toys-games/trading-cards/products/2025-topps-nfl-chrome-football-value-box/20034275.html',
    tcgId:       null,
    supplyScore: 10,
    liveMarket:  null,
    ebayQuery:   '2025 Topps Chrome Football Value Box Blaster',
    images:      [],
    imageUrl:    'https://www.steelcitycollectibles.com/storage/img/uploads/products/large/blaster-box-324121999684.jpg',
    contents:    '7 packs × 4 cards = 28 cards/box | retail value/blaster format',
    checklistUrl:'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2025_Chrome_Football_Checklist_040826.pdf?v=1775678965',
    oddsUrl:     'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2025_Topps_Chrome_Football_Odds.pdf?v=1776193199',
    boxConfig:   { cardsPerBox: 28, autosPerBox: 0 },
    releaseDate: 'Released April 15, 2026',
    sellThrough: {
      flip:   { range: '$40 – $55', units: '~30 – 60 boxes' },
      hold:   { range: '$45 – $65', units: '~15 – 30 boxes' },
      invest: { range: 'SKIP',      units: 'N/A' },
    },
    bulkBuy:  '~30 – 60 boxes',
    risk:     'Medium-High',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis:** First Topps Chrome NFL in the new Fanatics era after years off-license — novelty + nostalgia demand. But this is a RETAIL value box ($39.99, high print run), so the box itself is not the play; the edge is the blaster-EXCLUSIVE parallels (Red/White/Blue Refractor + Football Leather /25·/10·/5) that come in NO other format — format-locked scarcity on specific hits.\n• **Liquidity:** Football is the deepest in-season card market; strong rookie class drives per-box rip demand. Value boxes move fast at retail but flatten once widely stocked.\n• **Risk:** Mass-printed retail = sealed premium compresses to near/below MSRP once shelves fill. Margin is in singles/Leather parallels, not flipping sealed boxes. No 1-yr hold thesis on a retail blaster.',
      product:     '• Retail value/blaster — 7 packs × 4 = 28 cards/box; 400-card base (100 rookies #301–400)\n• Blaster-EXCLUSIVE: Red/White/Blue Refractor + Football Leather parallels (Orange /25 · Black /10 · Red /5) — only here\n• ~1 sequentially-numbered parallel per 4 boxes; base SuperFractor 1/1 a lottery (1:34k+ packs); autos rare (1:thousands)',
      priceComp:   '',
      supplyDemand:'',
      recs:        '• **Cost basis: ~$43** ($39.99 + ~8% tax) | eBay 13% fee\n• Targets + net/ROI live from pipeline comps — see embed\n• Edge = rip-for-Leather/RWB or sell singles, not sealed-box flips\n• Buy early-window only; retail blasters bleed to MSRP once stocked',
    },
  },
  'cactus-jack-bball-2526': {
    label:       '2025-26 Topps Chrome Cactus Jack Basketball',
    category:    'topps',
    set:         'Topps Chrome',
    retail:      499.99,
    retailNote:  'MSRP · EQL Release · 6/19 1PM EST (presale $489.99)',
    releaseUrl:  'https://www.topps.com/pages/topps-chrome-cactus-jack-basketball',
    tcgId:       null,
    supplyScore: 20,
    liveMarket:  null,
    ebayQuery:   '2025-26 Topps Chrome Cactus Jack Basketball Hobby Box',
    images:      [],
    contents:    '20 packs × 4 cards = 80 cards/box',
    checklistUrl: 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2025-26_Topps_Chrome_Cactus_Jack_Basketball_Checklist.pdf?v=1777925174',
    oddsUrl:      'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2025-26_Topps_Chrome_Cactus_Jack_Basketball_Odds.pdf?v=1777925174',
    boxConfig:   { cardsPerBox: 80, autosPerBox: 0 },
    releaseDate: '<t:1781892000:F> (<t:1781892000:R>) | EQL',
    sellThrough: {
      flip:   { range: '$650 – $850',   units: '~30 – 50 boxes' },
      hold:   { range: '$800 – $1100',  units: '~15 – 25 boxes' },
      invest: { range: '$1000 – $1500', units: '~10 – 15 boxes' },
    },
    bulkBuy:  '~30 – 50 boxes',
    risk:     'Medium',
    ebayFee:  0.13,
    writeup: {
      market:      '• **Thesis:** A standard Topps Chrome NBA hobby box runs ~$150–250; this commands 3–4× that on the Travis Scott brand alone, not the on-court roster. EQL caps supply with no restock and it\'s the first full NBA edition of the collab — event scarcity pulling sneaker + music + NBA money that flagship sports product never converges.\n• **Liquidity:** 112 eBay solds in 30 days — volume-backed and deep, not a thin break-hype gap that craters once content dries up. The premium is real, not aspirational.\n• **Risk:** Autos NOT guaranteed (~1 per 5 boxes) — an IP-scarcity bet, not a pull-value bet. If auto subjects or print quality underwhelm post-break, the premium compresses faster than a hit-floored release.',
      product:     '• Base 100 + 18 Refractor parallels + Utopia Highlights / Jacked Up / LA Flame Legends insert lines\n• Autos NOT guaranteed — ~1 on-card auto per 5 boxes (Base Auto Variation + Cactus Ink, ea 1:208 packs); box EV is hit-or-miss\n• Chase odds/box: Cactus Ink ~1:10 · base SuperFractor 1/1 ~1:379 · auto SuperFractor 1/1 ~1:1,347 · Orange Refractor ~1:15',
      priceComp:   '• MSRP $499.99 release ($489.99 EQL presale) | secondary comps pulled live via pipeline\n• No guaranteed-auto floor = box price tied to IP scarcity + speculation, not per-box hit value\n• Single-card market: Travis Scott autos + SuperFractor 1/1 are the headline value drivers',
      supplyDemand:'• EQL allocation fixes supply at release; no restock / FCFS mechanism\n• Crossover demand (music + sneaker + NBA) far exceeds typical basketball-only buyer pool\n• Non-guaranteed auto adds price volatility post-break as box EV gets discovered\n• Scarcity premium compounds if Travis Scott auto / SuperFractor pulls surface early',
      recs:        '• **Cost basis: ~$540** ($499.99 + ~8% tax) | eBay 13% fee on sale\n• Secondary targets + net/ROI computed live from pipeline comps — see embed fields\n• EQL: enter max allowed; crossover IP scarcity is the thesis, auto-variance is the risk\n• Watch first-break content — Travis Scott auto / 1/1 SuperFractor surfacing is the primary price catalyst',
    },
  },
  'inception-basketball-2526': {
    label:       '2025-26 Topps Inception Basketball',
    set:         'Topps Basketball',
    category:    'topps',
    retail:         289.99,
    retailVerified: true,
    retailNote:     'MSRP · FCFS · Pre-order 6/23 12PM EST · Fanatics account required',
    releaseUrl:  'https://www.topps.com/pages/topps-inception-basketball',
    tcgId:       null,
    supplyScore: 35,
    ebayQuery:   '2025-26 Topps Inception Basketball Hobby Box',
    images:      [],
    checklistUrl: 'https://www.checklistinsider.com/2025-26-topps-inception-basketball',
    boxConfig:   { cardsPerBox: 7, autosPerBox: 1 },
    contents:    '1 pack × 7 cards | 1 auto or auto-relic per box (avg) | First-ever licensed Topps NBA product | Rookie autos: Cooper Flagg, Dylan Harper, Ace Bailey, Kon Knueppel | Legend autos: Allen Iverson, Shaquille O\'Neal (Persistent Marks) | FDI edition (2 autos, Dutch auction) releases 7/23',
    releaseDate: '<t:1784764800:F> (<t:1784764800:R>) | Pre-order FCFS · Ships 7/23/26',
    sellThrough: {
      flip:   { range: '$370 – $420', units: '~20 – 50 boxes' },
      hold:   { range: '$400 – $500', units: '~10 – 25 boxes (hold through National)' },
      invest: { range: '$500+', units: '~5 – 10 boxes (Flagg trajectory thesis)' },
    },
    bulkBuy:   '3 – 6 boxes',
    risk:      '🟡 Medium',
    ebayFee:   0.13,
    writeup: {
      market:      '• **Thesis:** First-ever licensed Topps NBA product; Cooper Flagg (#1 Mavs pick) is the primary chase auto. Inception is an established premium brand — pre-built collector demand, not a debut format. 184 eBay solds/30d confirms liquid release-day market.\n• **Liquidity:** FCFS = broad retail access. National card show timing (Aug) = secondary demand wave. Topps Midnight Basketball (3 autos, $600 MSRP) trades ~$700s — Inception (1 auto, $290 MSRP) slots underneath with brand + license premium above standard Chrome.\n• **Risk:** eBay median $365 vs $313 cost = barely breakeven after fees. FCFS = uncapped supply. No odds sheet = unknown hit rate; "on average" auto language means some boxes arrive hitless.',
      product:     '• First licensed NBA Topps product — full team logos/branding; 2024-25 had none\n• **2025 rookie class depth:** Cooper Flagg (#1 Mavs), Dylan Harper (#2 Spurs), Ace Bailey (Jazz), Kon Knueppel (Hornets) — all 4 top picks have dedicated auto subsets. Strongest NBA rookie class since Zion/Ja 2019-20\n• Flagg/Harper dual-booklet = case hit ceiling. Flagg 1/1 is the ceiling card. Harper/Bailey/Knueppel add depth so weak-pull boxes still carry value\n• Sets: Dawn of Greatness (rookie autos), Persistent Marks (legend autos: Iverson, O\'Neal), Silver Signings, First Milestones (relics), Launch/Splashdown inserts\n• "On average" 1 auto per box = not hard-guaranteed; case = 8 boxes, ~6-box FCFS limit',
      priceComp:   '• MSRP $289.99 | Cost basis ~$313 (+8% tax) | Break-even ~$360 (after 13% eBay fee)\n• eBay median $365 (184 sold/30d) → net ~$5/box at current market — essentially breakeven at retail\n• 2024-25 Topps Inception Basketball (unlicensed, 2 autos, ~$135 MSRP) → $227 secondary avg, $250 ceiling (WaxStat)\n• 2025 Topps Inception Baseball ($249.99 MSRP) → climbed to $400+ over 12 months post-release\n• Topps Midnight Basketball ($600 MSRP, 3 autos) → mid-$700s secondary = ~$240/auto implied; Inception 1-auto at $365 = ~$52 implied auto premium over box cost\n• Topps Motif Basketball ($1,399.99, 5 autos) = ultra-premium tier — Inception competes in the mid tier',
      supplyDemand:'• FCFS = no hard supply cap; Topps prints to demand — meaningfully more available than EQL allocations\n• National card show (Aug) historically lifts premium basketball secondary as dealers and collectors buy ahead\n• Flagg rookie demand structural: every box can contain multiple Flagg base/parallel/auto layers, broadening per-box value floor\n• No published odds = can\'t size hit distribution across a case; first break videos (post-release day) are the key data trigger\n• FDI edition absorbs high-end collectors ahead of hobby; watch FDI secondary (opens 7/23) for read-through on hobby ceiling',
      recs:        '• **Cost basis: ~$313** ($289.99 + ~8% tax) | eBay 13% fee on sale\n• **Short term:** Breakeven at $365 current market — only worth buying retail if you expect release-day hype to push $400+. Flip fast at $395-420; don\'t hold for depreciation\n• **Long term:** Hold thesis requires Flagg confirming Year 1 production → $500+ sealed as supply depletion kicks in; Inception Baseball took 12 months to reach that trajectory\n• **Buy trigger:** Watch first break content release day — Flagg/Harper booklet or 1/1 surfacing = hold signal. Dud case breaks = sell into hype at $375-390 immediately',
      killSwitches: '',
    },
  },
  'inception-baseball-2025': {
    label:        '2025 Topps Inception Baseball',
    category:     'topps',
    set:          'Topps Baseball',
    retail:       249.99,
    retailNote:   'MSRP · FCFS · Releases 6/19 11AM EST',
    releaseUrl:   'https://www.topps.com/pages/topps-inception-baseball',
    tcgId:        null,
    supplyScore:  20,
    liveMarket:   { market: 320, low: 290, high: 360, sales: 20, note: 'eBay pre-order active listings (6/16/26)' },
    ebayQuery:    '2025 Topps Inception Baseball Hobby Box',
    images:       [],
    checklistUrl: 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2025_Topps_Inception_Baseball_25TIBB_-_Checklist_5.18.pdf?v=1779116690',
    boxConfig:    { cardsPerBox: 7, autosPerBox: 1 },
    contents:     '1 pack × 7 cards | 1 On-Card Auto per box | On-Card format = Inception\'s signature — no sticker autos',
    releaseDate: '<t:1781884800:F> (<t:1781884800:R>) | FCFS',
    sellThrough: {
      flip:   { range: '$300 – $340', units: '~30 – 50 boxes' },
      hold:   { range: '$310 – $360', units: '~15 – 25 boxes' },
      invest: { range: '$360 – $420', units: '~10 – 15 boxes' },
    },
    bulkBuy:   '3 – 6 boxes',
    risk:      '🟢 Low-Medium',
    ebayFee:   0.13,
    writeup: {
      market:      '• Baseball market strong in 2026 — Chrome, Finest, Platinum all performing well\n• On-card auto format drives premium collector demand vs sticker alternatives\n• Pre-order market at $290-360 before release confirms active buyer intent',
      product:     '• 1-pack format = intentionally limited print run by design\n• On-Card autos command 20-40% premium over sticker pulls on individual card sales\n• Inception historically strong on top prospects + vets — checklist quality is the variable\n• Checklist TBD at press time — posted ~25 min before drop per prior year pattern',
      priceComp:   '• MSRP $249.99 | Pre-order median $320 | Pre-order avg $326 (20 active eBay listings)\n• 2025 Inception comp: $180 MSRP → $250 drop → $350-400 (1mo) → $500-600+ now\n• 2026 MSRP up 39% vs 2025 — only meaningful if checklist quality matches the increase\n• $290 floor already set in pre-order market — downside limited at retail price',
      supplyDemand:'• 1-pack format = print run is intentionally constrained vs multi-pack formats\n• FCFS release means bots compete — speed matters at 11AM EST\n• Checklist quality will dictate whether $320 pre-order holds or dips post-break videos\n• No reprint mechanism for hobby boxes — supply is fixed at production run',
      recs:        '• **Cost basis: ~$270** ($249.99 + ~8% tax) | eBay 13% fee on sale price\n• **Short term:** Need $311+ to break even — list $330-345 for ~$17-27 net/box after all fees\n• **Long term:** Hold to $360-420 for ~$43-95 net/box — supply depletion is the thesis\n• Watch checklist drop ~10:35AM 6/19 — weak checklist = pre-order market dips to $290, skip; strong checklist = buy more at retail',
    },
  },
  'dr-etb': {
    label:      'Destined Rivals Elite Trainer Box',
    category:   'pokemon',
    set:        'Destined Rivals',
    retail:     69.99,
    retailNote: 'Walmart · IP 19965460207 · Target · TCIN 1011467802',
    walmartItemId: '19965460207',
    releaseUrl: 'https://www.target.com/p/-/A-1011467802',
    forceRating: 'ORANGE',
    _dbKey:     'Destined Rivals',
    tcgId:      null,
    ebayQuery:  'Pokemon Destined Rivals Elite Trainer Box SV10',
    images:    [],
    contents:  '9 booster packs + ETB accessories | PC Exclusive ETB also available ($224.99)',
    releaseDate: 'Released December 2025 | ⚠️ Reprint cycle active — retail restock imminent',
    sellThrough: {
      flip:   { range: '$188 – $200', units: '~25 – 74 units' },
      hold:   { range: '$150 – $175', units: '~25 – 50 units (post-reprint rebound target)' },
      invest: { range: 'SKIP', units: 'N/A' },
    },
    bulkBuy:   '25 – 74 units — flip above $186 now OR hold through reprint dip, buy more below $120',
    risk:      '🟠 Medium — reprint incoming, floor ~$120–130; rebound thesis requires patience',
    ebayFee:   0.13,
    writeup: {
      market:      '• Released December 2025. Now 6 months on market — entering reprint cycle.\n• Wholesale trajectory: $257 launch (Dec 2025) → $204 (May 30) → $184 (Jun 3) → $185 (Jun 8)\n• 80-unit block sale on Jun 3 signals institutional liquidation ahead of restock wave\n• Reprint cycle history: announcement triggers 20–50% crash, floor holds 2–4 weeks, then rebound to stabilization at MSRP +10–20% over 4–12 weeks',
      product:     '• 9 booster packs + full ETB accessories | SV10 Scarlet & Violet: Destined Rivals\n• IP anchors: Team Rocket\'s Mewtwo ex SIR (~$480 single) + Cynthia\'s Garchomp ex / Ethan\'s Ho-Oh ex — Team Rocket nostalgia theme, no Charizard in set\n• PC Exclusive ETB on separate trajectory: $257 → $485 now, ask $550 — rising independent of standard\n• Strong IP = reprint dip is not permanent. PE ETB blueprint: reprinted Jan 2025, crashed to $60–70, now $147–200 (17 months later)',
      priceComp:   '• $69.99 retail | Current wholesale: bid $183–186, ask $195–200, last trade $185.50\n• Post-reprint floor estimate: $120–135 (−30–35% from current bids, consistent with SV-era reprint pattern)\n• Post-reprint rebound target: $150–175 at weeks 6–10 | $180+ at months 4–6 if IP sustains\n• At retail cost basis ($69.99), even post-reprint floor nets 70–93% ROI before fees — hold math works',
      supplyDemand:'• Current bid wall: 160+ units stacked $183–186 — institutional floor, not speculative\n• Restock/reprint compresses secondary near-term; supply glut absorbs in 4–8 weeks historically\n• PC Exclusive: 31 units at $550 ask, no reprint path — supply only tightens from here\n• Team Rocket\'s Mewtwo ex + Giovanni/Cynthia chase IP ensures demand does not collapse post-reprint the way weaker sets do',
      recs:        '• **Short term (now → reprint announcement):** Flip $188–200 if capital needed. $186 is the professional floor — do not sell below.\n• **Through reprint dip (weeks 1–4 post-announcement):** Hold if bought at retail. Do NOT panic-sell at floor — PE ETB blueprint shows floor buyers profited most.\n• **Post-reprint buy zone:** If restocking drops standard below $120, that is the buy zone — add units, target exit at $160–175 in weeks 6–10.\n• **PC Exclusive:** Separate hold thesis. $400 or below = entry. $500+ by Q3 2026 is conservative.',
    },
  },
  'pb-etb': {
    label:      'Pitch Black Elite Trainer Box',
    category:   'pokemon',
    set:        'Pitch Black',
    retail:     59.99,
    retailNote: 'Target · TCIN 1011483406 · Walmart · IP 20161351456',
    walmartItemId: '20161351456',
    releaseUrl: 'https://www.target.com/p/-/A-1011483406',
    rating:     'GREEN',
    tcgId:      692947,
    ebayQuery:  'Pokemon Pitch Black Elite Trainer Box Mega Evolution',
    images:    [692947],
    contents:  '9 booster packs + ETB accessories | ME05 Mega Evolution: Pitch Black | Mega Darkrai ex, Mega Zeraora ex',
    releaseDate: '<t:1752796800:F> (<t:1752796800:R>) | Drops Jul 17, 2026',
    sellThrough: {
      flip:   { range: '$115 – $135', units: '' },
      hold:   { range: '$130 – $155', units: '' },
      invest: { range: '$150 – $185', units: '' },
    },
    bulkBuy:   'Pre-release — monitor Day 1 secondary for floor',
    risk:      '🟢 Low-Medium — releasing Jul 17, IP strong (Mega Darkrai + Zeraora)',
    ebayFee:   0.13,
    writeup: {
      market:      '',
      product:     '• 9 booster packs + full ETB accessories | ME05 Mega Evolution: Pitch Black\n• Chase IPs: Mega Darkrai ex + Mega Zeraora ex — both fan-favorite dark/electric tier\n• Part of Mega Evolution series with AH (sold out), CR, and PO — brand momentum building\n• Pre-order secondary market forming; Day 1 secondary price will set the floor',
      priceComp:   '',
      supplyDemand:'• Pre-release — retail allocation unknown. Mega Evolution series has run thin at Target/Walmart historically\n• Darkrai ex IP has sustained premium in every prior format (Gen 4 nostalgia driver)\n• Zeraora ex is less proven but pairs well with the dark aesthetic — dual-IP ETB reduces single-card dependency\n• Watch AH ETB secondary on Jul 17 as comp: same box format, same series momentum',
      recs:        '• **Short term:** Buy at $59.99 retail | target flip $115–135 within 30 days if secondary clears $110+\n• **Long term:** Hold if Mega Darkrai ex alt-arts pull rate sustains demand — target $150–175 by Sep 2026\n• Do not over-buy before Day 1 price discovery — wait for secondary floor to confirm before stacking',
    },
  },
  'po-etb': {
    label:      'Perfect Order Elite Trainer Box',
    category:   'pokemon',
    set:        'Perfect Order',
    retail:     59.99,
    retailNote: 'Target · TCIN 95230445 · Walmart · IP 19402160990',
    walmartItemId: '19402160990',
    releaseUrl: 'https://www.target.com/p/-/A-95230445',
    rating:     'GREEN',
    tcgId:      672401,
    ebayQuery:  'Pokemon Perfect Order Elite Trainer Box Mega Evolution',
    images:    [672401],
    contents:  '9 booster packs + ETB accessories | ME03 Mega Evolution: Perfect Order | Mega Zygarde ex, Mega Clefable ex, Mega Starmie ex',
    releaseDate: 'Released March 27, 2026',
    sellThrough: {
      flip:   { range: '$88 – $105', units: '' },
      hold:   { range: '$98 – $120', units: '' },
      invest: { range: '$110 – $135', units: '' },
    },
    bulkBuy:   '3 months on market — secondary stabilized, buy at retail if available',
    risk:      '🟢 Low-Medium — 3 months old, moderate IP, market ~$96',
    ebayFee:   0.13,
    writeup: {
      market:      '',
      product:     '• 9 booster packs + full ETB accessories | ME03 Mega Evolution: Perfect Order\n• Chase IPs: Mega Zygarde ex, Mega Clefable ex, Mega Starmie ex — mid-tier nostalgia, no Charizard/Eeveelution\n• Weakest IP anchor of the Mega Evolution ETB series — suppresses ceiling vs AH/PB\n• 3 months on market — price has stabilized, retail arbitrage window largely closed at most stores',
      priceComp:   '',
      supplyDemand:'• Retail restocks ongoing at Target/Walmart — supply not constrained\n• Mid-tier IP means demand is collector-driven rather than speculator-driven\n• No reprint announcement yet — supply curve is predictable\n• Best play is arbitrage at $59.99 retail; do not pay above $70 for resale',
      recs:        '• **Short term:** Flip $88–105 if sourced at $59.99 retail — 25–47% ROI after fees\n• **Long term:** Hold only if retail sourced AND willing to wait 6+ months for $110+ ceiling\n• Lower priority vs AH/PB due to weaker IP — allocate capital there first',
    },
  },
  'cr-etb': {
    label:      'Chaos Rising Elite Trainer Box',
    category:   'pokemon',
    set:        'Chaos Rising',
    retail:     59.99,
    retailNote: 'Target · TCIN 95267143 · Walmart · IP 19988614228',
    walmartItemId: '19988614228',
    releaseUrl: 'https://www.target.com/p/-/A-95267143',
    rating:     'GREEN',
    tcgId:      684450,
    ebayQuery:  'Pokemon Chaos Rising Elite Trainer Box Mega Evolution',
    images:    [684450],
    contents:  '9 booster packs + ETB accessories | ME04 Mega Evolution: Chaos Rising | Mega Greninja ex, Mega Floette ex, Mega Pyroar ex',
    releaseDate: 'Released May 22, 2026',
    sellThrough: {
      flip:   { range: '$75 – $90', units: '' },
      hold:   { range: '$85 – $100', units: '' },
      invest: { range: '$95 – $115', units: '' },
    },
    bulkBuy:   '1 month on market — early secondary window, monitor for price compression',
    risk:      '🟠 Medium — 1 month old, mixed IP, market ~$82',
    ebayFee:   0.13,
    writeup: {
      market:      '',
      product:     '• 9 booster packs + full ETB accessories | ME04 Mega Evolution: Chaos Rising\n• Chase IPs: Mega Greninja ex, Mega Floette ex, Mega Pyroar ex, Mega Dragalge ex\n• Greninja ex is the anchor — Gen 6 fan-favorite with sustained demand in all formats\n• Floette ex (AZ Floette) has niche collectors but is not a mass-market driver',
      priceComp:   '',
      supplyDemand:'• 1 month on market — secondary still in price discovery, not fully stabilized\n• Greninja ex alt-arts pull rate will determine whether $80 floor holds or compresses\n• Retail availability still moderate — not a scarce product yet\n• Watch 30-day secondary volume: high sell-through at $80+ = hold thesis; low volume = flip now',
      recs:        '• **Short term:** Flip $75–90 if sourced at $59.99 — margin exists but thin at 13% fees\n• **Long term:** Hold ONLY if Greninja ex premium sustains above $85 secondary — 6-month target $95–110\n• Lower conviction than AH or PB — smaller allocation, faster flip timeline',
    },
  },
  'ah-display': {
    label:      'Ascended Heroes Booster Bundle Display',
    category:   'pokemon',
    set:        'Ascended Heroes',
    retail:     299.90,
    retailNote: 'Distributor / Wholesale — 10 × Booster Bundles (60 packs)',
    releaseUrl: 'https://www.tcgplayer.com/product/692362',
    rating:     'DBLGREEN',
    tcgId:      692362,
    ebayQuery:  'Pokemon Ascended Heroes Booster Bundle Display Mega Evolution',
    images:    [692362],
    contents:  '10 × Booster Bundles | 60 booster packs total | Mega Charizard ex, Mega Blastoise ex, Mega Venusaur ex chase IPs',
    sellThrough: {
      flip:   { range: '$550 – $750', units: '' },
      hold:   { range: '$700 – $900', units: '' },
      invest: { range: '$850+',       units: '' },
    },
    bulkBuy:   'Source at distributor cost — verify DX ask before committing',
    risk:      '🟢 Low — Gen 1 IP, distributor-only supply, no retail restock path',
    ebayFee:   0.13,
    writeup: {
      market:      '',
      product:     '• 10 × Booster Bundles (60 packs) | ME01 Mega Evolution: Ascended Heroes\n• Chase IPs: Mega Charizard ex, Mega Blastoise ex, Mega Venusaur ex — Gen 1 holy trinity\n• Distributor-only product — no shelf presence at Target/Walmart; supply is fixed at initial print allocation\n• Display format = highest long-term appreciation tier; no restock mechanism once initial allocation moves',
      priceComp:   '',
      supplyDemand:'• No retail restock path — distributor allocation only; once moved, secondary is the only source\n• Gen 1 IP sustains demand indefinitely — same collector base as base set reprints\n• Display box holds better than individual bundles: bulk buyers and case breakers both competing for supply\n• Individual BB secondary at $85-105 implies display fair value $850-1050; actual display commands premium above sum-of-parts',
      recs:        '• **Short term:** Flip $550-750 — fast turn, Gen 1 IP moves quickly to breakers and collectors\n• **Long term:** Hold to $900+ as distributor stock depletes; no reprint path = supply only tightens\n• Do not sell below $500 — cost basis from distributor leaves margin; Gen 1 IP has no demand floor risk',
    },
  },
  'ah-heavy': {
    label:      'Ascended Heroes Heavy Hitters Collection',
    category:   'pokemon',
    set:        "Mega Evolution (Sam's Club Exclusive)",
    retail:     54.98,
    retailNote: "Sam's Club · Item #13590524234",
    retailVerified: true,
    releaseUrl: 'https://www.samsclub.com/p/13590524234',
    rating:     'DBLGREEN',
    forceRating: 'DBLGREEN',
    forceRisk:  "🟡 Medium · presale comps only (drops 7/21/26, no confirmed sold-volume yet)",
    preRelease: true,
    tcgId:      null,
    images:     [668496],
    ebayQuery:  'Pokemon Ascended Heroes Heavy Hitters Collection',
    // bulkBuy intentionally omitted — DBLGREEN default (250+) applies; Sam's 2/member limit noted in stockNote
    contents:  '~14 Ascended Heroes booster packs + oversized promo foil + promo cards + coin | 14 packs × $16.48 TCGPlayer pack market = ~$230 pack value',
    stockNote: "Drops ~7/21/26 — TN Sam's getting 10 pallets | Stores: 2-3 pallets each",
    sellThrough: {
      flip:   { range: '$100 – $135', units: '~8 – 15 units' },
      hold:   { range: '$120 – $150', units: '~5 – 10 units' },
      invest: { range: '$140 – $175', units: '~3 – 6 units' },
    },
    risk:      '🟢 Low',
    ebayFee:   0.13,
    writeup: {
      market:      "• Sam's exclusive removes Target/Walmart supply competition entirely\n• AH IP demand is the strongest Pokemon market signal of the current era\n• Prior Heavy Hitters exclusives (Brilliant Stars, Lost Origin) held $80-120 for 60-90 days — AH has higher ceiling",
      product:     "• ~14 AH packs + oversized promo foil + promo cards + coin\n• Cost-per-pack ~$3.93 vs $16.48 TCGPlayer pack market — buyers rip for pack value alone\n• Sealed bundle AND individual pack breakout are both profitable exits",
      priceComp:   "• $55 retail vs $100-135 sealed market = 80-145% margin\n• 14 packs × $16.48 pack market = ~$230 pack value at $55 buy-in\n• Sealed premium is the easy play; pack breakout is the backup if sealed market softens",
      supplyDemand:"• Sam's membership requirement caps buyer pool naturally\n• TN Sam's 10 pallets = regional signal — in-store before online is the move if local\n• 2-per-member limit; maximize all Sam's accounts before drop",
      recs:        "• **Short term:** Drop day 7/21 — in-store pickup priority, flip sealed $110-130 within 2 weeks\n• **Long term:** Hold select units sealed to $140-175 as AH pack market sustains\n• Prep Sam's accounts NOW — add item #13590524234 to List today",
    },
  },

  'fin-ff-cbb': {
    label:      'MTG Final Fantasy Collector Booster Box',
    category:   'mtg',
    set:        'Final Fantasy',
    _dbKey:     'final-fantasy',
    retail:     455.88,
    retailVerified: true,
    tcgId:      618893,
    images:     [618893],
    upc:        'WOCD3844',
    releaseUrl: 'https://magic.wizards.com/en/products/final-fantasy',
    ebayQuery:  'MTG Final Fantasy Collector Booster Display Box sealed',
    contents:   '12 Collector Booster packs | Universes Beyond: Final Fantasy | Extended Art, Borderless, Serialized cards | FINAL FANTASY VI, VII, X, XIV, XVI characters',
    ebayFee:    0.13,
    forceRating: 'DBLGREEN',
    forceRisk:   '🟢 Low',
    evidence: [
      { source: 'StockX live (2026-06-28)', date: '2026-06-28', point: 'FF CBB ask $1,349 / bid $1,000 / last $1,175 — confirmed box-level pricing, 2.58× retail' },
      { source: 'Walmart 3P live (2026-06-28)', date: '2026-06-28', point: 'Walmart 3P listing $1,234.95 in stock — scalper floor holding 12+ months post-release' },
      { source: 'WPN / MSRP verified', date: '2026-06-28', point: 'MSRP $37.99/pack × 12 = $455.88 per WPN item WOCD3844. No reprint announced per WPN intel.' },
    ],
    writeup: {
      market:       '• **Thesis — IP demand at 2.6× retail with 176 Discord mentions and $94k/mo eBay volume:** Final Fantasy CBB commands $1,175-1,235 sealed across eBay/StockX/Walmart vs $455 MSRP — driven by the broadest IP fanbase in gaming (FFVII/X/XIV mainstream crossover). Collector boxes run 82 sold/mo with 40 IG posts, sustained velocity 12+ months post-release.\n• **Liquidity:** $94,300/mo eBay dollar volume (heavy buy), 82 sold in 30d, 3d to exit $10k position — institutional-grade floor for sealed TCG.\n• **Risk:** MTG print-run uncertainty (WotC has reprinted UB sets), but LOTR/Marvel precedents show UB flagships hold for 18+ months before any reprint discussion. FF print allocation was limited per WPN intel.',
      product:      '• 12 Collector Booster packs | WPN item WOCD3844 | MSRP $37.99/pack × 12 = $455.88\n• **Box contents:** Extended Art, Borderless, Showcase (Pixel Art + Frame Break), Serialized cards | Characters: Sephiroth, Cloud, Tifa, Aerith, Terra, Lightning, Tidus, Y\'shtola across FFVI/VII/X/XIV/XVI\n• **Chase singles:** Vivi Ornitier $54.59 | Sephiroth (DFC) $42.66 | Cloud $29.41 | Y\'shtola $21.26 | Lightning $17.60\n• At $455 retail: expected pull rate to chase cards = strong EV case for crackers; sealed retains $1,150+ floor for holders',
      priceComp:    '• eBay 30d median: **$1,150** (82 sold) | 90d: **$1,150** (190 sold) — floor holding tight\n• StockX: **$1,175** (ask $1,349 / bid $1,000) | Walmart 3P: **$1,235** | TCGPlayer: **$1,238**\n• Blended market: **$1,191** | Retail: **$455.88** | ROI: **163%** | Multiple: **2.6×**\n• vs LOTR CBB ($350 now, $1,400 ATH, $300 retail): LOTR settled at 1.2× retail after reprint waves — FF at 2.6× shows no comparable supply relief yet',
      supplyDemand: '• Supply: WPN-allocated print run, no announced reprint — 12+ months into release, limited retail exposure; ChannelFireball/distribution sold out\n• Demand: 176 Discord mentions, #mtgfinalfantasy 30 IG posts, #mtgfinal 22 posts — community staying active 1yr post-release; Walmart 3P listing at $1,235 shows scalper floor holding\n• Absorption: 82 sealed sold/mo at $1,150+ median = steady institutional demand; Whatnot 40 listings with active bidding\n• Reprint risk: WotC has not signaled FF reprint; UB policy tends to protect first print ~18-24mo; LOTR took 2yrs to get reprint announcement',
      recs:         '• **Buy** at $1,100-1,200 | **Hold** 6-12mo target $1,400-1,500 (LOTR ATH comp trajectory)\n• **Sell** at $1,350+ (StockX ask) or on any reprint rumor surfacing\n• **Crack** only if individual chase cards spike further (Sephiroth DFC $42 now → could run $80-100 on tournament play)',
      scenarios:    '**Bull (35%):** FF characters enter competitive MTG format → Sephiroth/Cloud EDH staples drive crack demand → sealed $1,400-1,600. **Base (45%):** sustained $1,100-1,300 range, slow appreciation as supply tightens into year 2, exit at $1,350. **Bear (20%):** WotC announces reprint/collectors edition within 12mo → drops to $600-800 (still above retail, not catastrophic).',
      closestComps: '• **LOTR CBB** (best comp): $300 retail → $1,400 ATH → $350 now; FF has stronger ongoing IP but similar trajectory; LOTR took 18mo to peak\n• **Marvel Spider-Man CBB**: $450 retail → $582 ATH → $339 now; smaller IP crossover fanbase than FF → underperforming; FF should outperform\n• **Bloomburrow CBB**: $250 retail → $802 ATH; original-IP ceiling lower than gaming crossover IPs',
      exitWindow:   '• **Flip NOW** at $1,150-1,235 (163% ROI secured, 82 sold/mo volume available)\n• **Hold to $1,350+** if position < $10k — 3d to exit at that level per velocity\n• **Max hold**: 18mo or first reprint rumor — whichever comes first',
    },
  },

  'stx-cbb': {
    label:      'MTG Secrets of Strixhaven Collector Booster Box',
    category:   'mtg',
    set:        'Secrets of Strixhaven',
    retail:     323.98,
    retailVerified: true,
    tcgId:      675558,
    images:    [675558],
    upc:        'B0GFDD1RLS',
    releaseUrl: 'https://www.amazon.com/dp/B0GFDD1RLS',
    ebayQuery:  'MTG Secrets of Strixhaven Collector Booster Box sealed',
    contents:  '12 Collector Booster packs | Secrets of Strixhaven | Mystical Archive reprints, Extended Art, Special Guests',
    ebayFee:   0.13,
    writeup: {
      market: '• **Thesis — Mystical Archive premium commands 33% ROI over MSRP:** STX CBB at $432 market vs $323.98 MSRP = 33% sealed premium. Not a UB/IP novelty — this is a core MTG plane with Mystical Archive reprints (Demonic Tutor, Ancestral Recall variants), Extended Art, and Special Guests. Core plane CBBs hold better than IP sets post-launch; LOTR launched $149.99 and now sits $350 (2.3×), while Marvel Spider-Man launched at $582 and faded to $339 (-40%). STX has no "IP hype fade" risk.\n• **Liquidity:** 95 eBay sold/30d, 217/90d = 3+ units/day consistent. StockX bid $353 / ask $430 (narrow $77 spread = liquid). 174 Discord mentions = active speculator interest. No liquidity concern for moderate positions.\n• **Risk:** Wizards reprints. Mystical Archive cards ALREADY appeared in STX 2021 — if a reprint set hits, the premium gets cut. Extended Art exclusives are the protection layer. Collector demand ceiling is $480-500 based on Amazon/Walmart scalper ask.',
      product: '• 12 Collector Booster packs | premium format — highest hit rate per pack\n• Mystical Archive reprints: Demonic Tutor, Ancestral Recall variants — high singleton demand\n• Extended Art + Special Guests — exclusive to Collector boxes, not in Play/Draft\n• **Two exit paths:** crack for Mystical Archive singles OR hold sealed (market tracks up from launch)\n• Based on LOTR/TMNT/Foundations comps, core-set CBBs hold and appreciate vs IP sets that fade',
      priceComp: '• Current market $432 vs comp median ~$360 (TMNT $380 / Foundations $375 / Bloomburrow $340)\n• STX 2026 commands a premium to settled comps — Mystical Archive demand + newer release\n• Final Fantasy CBB now $184 (crashed from launch) — IP novelty fade. STX has no IP dependency.\n• LOTR CBB: launched $149.99 MSRP → $350 current (+133%); STX launched $324 → $432 (+33% in early market)\n• StockX ask $430 closely tracks eBay $435 — institutional pricing, not single-seller ask',
      supplyDemand: '• Supply: WotC print run — no announced reprint of STX 2026 yet. Fixed initial run.\n• Demand: Mystical Archive (Demonic Tutor $21.68, Ancestral Recall variant $14.24) drives crack demand; EV per box supports cracking at $432\n• 95 sold/30d vs 44 active listings = 2:1 sell-through ratio — sellers absorbing demand, not flooding\n• Scarcity signal: StockX bid $353 vs ask $430 — spread narrows as supply contracts',
      recs: '• Buy at market $420-435 | sell at $460-500 (StockX + Amazon scalper ceiling)\n• Crack EV: Mystical Archive singles (Demonic Tutor + Ancestral Recall variants) + Extended Art pulls justify cracking at $432 MSRP equivalent\n• Hold 60-90d for settled premium ($400-450 range based on TMNT/Foundations trajectory)\n• Position: 5-10 units max — CBB market is $1-2M/mo nationally, not a capacity-capped product',
      scenarios: '**Bear (25%):** Reprint of Mystical Archive cards in supplemental set → -20-30% ($300-350). Fundamentally the only downside catalyst.\n**Base (55%):** Holds $400-450 range for 90d. Crack EV covers MSRP + moderate sealed premium. 30-35% ROI maintained.\n**Bull (20%):** Mystical Archive FOMO + no reprint announcement → $480-500 (Walmart scalper = ceiling). 50%+ ROI.',
      closestComps: '• **LOTR Collector Box** (best comp): launched $149.99 MSRP → $350 now (+133%), premium IP but non-IP STX launch stronger per-MSRP\n• **TMNT CBB** $380 / **Foundations CBB** $375 — settled core-set CBB market range; STX at $432 = 15% above settled peers (justified by Mystical Archive exclusives)\n• **Marvel Spider-Man CBB** $339 — IP fade comp; STX avoids this because no IP dependency',
      exitWindow: '• Flip window: NOW at $432 (33% ROI) or $460+ if StockX ask closes toward $480\n• Hold: 60-90d → target $440-460 based on CBB comp trajectory\n• Max hold: 6mo; Mystical Archive reprint is the kill switch — exit if WotC announces supplemental STX product',
    },
  },

  'aotv-bb': {
    label:      'Disney Lorcana Attack of the Vine Booster Box',
    category:   'lorcana',
    set:        'Attack of the Vine',
    retail:     143.76,
    retailVerified: true,
    releaseDate: '<t:1753315200:F> (<t:1753315200:R>) | Prerelease July 17, 2026',
    preRelease: true,
    tcgId:      690384,
    images:    [690384],
    ebayQuery:  'Disney Lorcana Attack of the Vine Booster Box',
    contents:  '24 booster packs (6C/3U/2R+/1Foil per pack) | Set 13 | Monsters Inc., Up, Turning Red | 207 cards',
    releaseUrl: 'https://www.tcgplayer.com/categories/trading-and-collectible-card-games/disney-lorcana/attack-of-the-vine',
    ebayFee:   0.13,
    evidence: [
      { source: 'eBay sold', date: '2026-06-25', point: 'Presale median $164 — 21 sold/30d, 47 active listings; floor pricing for sealed box at release' },
      { source: 'StockX', date: '2026-06-25', point: 'MSRP confirmed $143.76; StockX ask $140 / bid $80 — scalper spread wide, no consensus price yet' },
      { source: 'TCGPlayer', date: '2026-06-25', point: 'TCGPlayer market $328 — early scalper/LGS asks; not yet anchored to real sell-through' },
    ],
    writeup: {
      market:      '• Lorcana Set 13 demand muted vs villain-heavy sets (The Ursula Collection, Into the Inklands) — Monsters Inc./Up/Turning Red = beloved but not collector-tier IP for card buyers\n• 282 Discord mentions shows baseline awareness; not trending aggressively pre-drop\n• Ravensburger reprints all sets to demand — presale premium typically evaporates 30-60 days post-release as supply catches\n• Best comp: Set 11 Archazia\'s Island booster box tracked retail → below retail within 45 days; Set 12 similar trajectory\n• Risk is front-loaded: buy-release-flip window is 1-2 weeks before reprint pressure normalizes market',
      product:     '• 24 packs / 288 cards per box | 207-card set (largest Lorcana set to date)\n• Foil per pack + Enchanted rarity chase tier sustains box EV\n• IP: Monsters Inc. (Sully, Mike, Boo), Up (Carl, Russell, Dug), Turning Red (Meilin, Panda) — Pixar-deep cut collector appeal, not mainstream villain demand\n• Set 13 = milestone size (first 207-card Lorcana set) may attract completionist buyers',
      priceComp:   '• $143.76 retail → $164 eBay median = ~14% gross margin before fees; after 13% eBay fee = $142.68 net vs $143.76 cost → effectively breakeven at release floor\n• TCGPlayer scalper asks $328 — not reliable; inflated LGS/early listing premium\n• StockX bid $80 signals weak secondary demand from serious investors\n• Closest comp: Archazia\'s Island booster box — launched near retail, faded to $130-140 within 6 weeks\n• Flip window: first 72 hours at $155-175 if supply is short at LGS/prerelease; normalize to $135-150 by week 3',
      supplyDemand:'• Ravensburger reprint cadence: 6-10 weeks post-launch restocks kill sealed premium on all non-exclusive sets\n• No Illumineer\'s Society exclusive SKU = no supply cap — full reprint exposure\n• 282 Discord mentions reflects set interest but not buy-pressure velocity seen in villain-IP drops\n• LGS prerelease events July 17 drain some box supply early, compressing week-1 eBay inventory briefly',
      recs:        '• **Short term:** Prerelease event (July 17) to release day (July 24) = 7-day flip window; list at $165-180 IMMEDIATELY at event; do not hold past week 2\n• **Long term:** Skip — Ravensburger reprint will normalize to $130-150 range; no scarcity floor on standard Lorcana boxes\n• Unit count: <50 — low margin product, high reprint risk; prioritize other drops',
      scenarios:   '**Bear (35%):** Supply meets demand week 1; eBay median drops to $135-145 (at or below retail); 0-5% net gain\n**Base (45%):** Presale momentum holds 2-3 weeks; sell $155-170; ~5-12% ROI after fees — thin but positive\n**Bull (20%):** IP surprise demand (Turning Red/Monsters Inc. chase cards hit) drives $190-220 sealed for 1-2 weeks; 20-35% ROI on fast flip',
      closestComps:'• Archazia\'s Island (Set 11) booster box: $143 retail → $155-165 peak → $130 settled\n• Shimmering Skies (Set 8) booster box: $143 retail → $160 launch → $125 month 2\n• Azurite Sea (Set 10) booster box: $143 retail → $170 launch → $140 month 2 (stronger IP)',
      exitWindow:  '• **Flip:** July 17-24 (prerelease + release week) — sell before restock wave hits; aim $160-175\n• **Hold:** No — Ravensburger reprint policy makes 90d+ hold thesis invalid on standard sets\n• **Invest:** Skip — no scarcity mechanics, no EOL date, perpetual reprint exposure',
    },
  },
} };

// ── Main ───────────────────────────────────────────────────────────────────────
const productKey = process.argv[2];
const DEEP       = true;
if (!productKey || !PRODUCTS[productKey]) {
  console.error(`Usage: node fiddler-research.mjs <product-key> [--deep]`);
  console.error(`Keys: ${Object.keys(PRODUCTS).join(', ')}`);
  process.exit(1);
}

const prod = { ...PRODUCTS[productKey] };

// ── AUTO-DETECT category + build DB if category empty (NEW RULE) ──────────────
// Any product with no category: detect from label/key, set category, save to dynamic-products.json.
// If it's a TCG product, also run tcgProductSearch to get the product ID (saved for future runs).
if (!prod.category) {
  const _lbl = `${prod.label ?? ''} ${productKey}`.toLowerCase();
  if (/one.piece|op-?\d{2}/i.test(_lbl)) {
    prod.category = 'one_piece';
    console.log(`  [auto-cat] detected one_piece from label`);
  } else if (/\bpokemon\b|elite trainer|booster box.*sv|sv\d|scarlet.*violet|destined rival|pitch black|paldea|paradox|surging spark|stellar crown|twilight masquerade|shrouded fable|obsidian flame|temporal force|paldean fate|151\b|mega evolution|ascended hero/i.test(_lbl)) {
    prod.category = 'pokemon';
    console.log(`  [auto-cat] detected pokemon from label`);
  } else if (/lorcana|disney/i.test(_lbl)) {
    prod.category = 'other_tcg';
    console.log(`  [auto-cat] detected lorcana/other_tcg from label`);
  } else if (/magic|mtg\b|secret lair/i.test(_lbl)) {
    prod.category = 'mtg';
    console.log(`  [auto-cat] detected mtg from label`);
  } else if (/topps|panini|bowman/i.test(_lbl)) {
    prod.category = 'topps';
    console.log(`  [auto-cat] detected topps/sports from label`);
  } else if (/\blego\b/i.test(_lbl)) {
    prod.category = 'lego';
    console.log(`  [auto-cat] detected lego from label`);
  } else {
    prod.category = 'noncard';
    console.log(`  [auto-cat] no category match — defaulting to noncard`);
  }
  // Persist detected category + retail to dynamic-products.json
  if (existsSync(_dynamicPath)) {
    try {
      const _dp = JSON.parse(readFileSync(_dynamicPath, 'utf8'));
      if (_dp[productKey]) {
        _dp[productKey].category = prod.category;
        writeFileSync(_dynamicPath, JSON.stringify(_dp, null, 2) + '\n');
        console.log(`  [auto-cat] saved category "${prod.category}" → dynamic-products.json`);
      }
    } catch (e) { console.log('  [auto-cat] save failed:', e.message); }
  }
}

// ── Merge dashboard form fields (passed as env vars) ─────────────────────────
if (process.env.USER_RETAIL)   { prod.retail = parseFloat(process.env.USER_RETAIL); console.log(`  [form] retail override: $${prod.retail}`); }
if (process.env.USER_CATEGORY) { prod.category = process.env.USER_CATEGORY; console.log(`  [form] category override: ${prod.category}`); }
if (process.env.USER_URL) {
  prod.releaseUrl = prod.releaseUrl ?? process.env.USER_URL;
  // WebFetch the URL and inject content as analyst context
  try {
    const urlRes = await fetch(process.env.USER_URL, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
    if (urlRes.ok) {
      const html = await urlRes.text();
      // strip tags, collapse whitespace, take first 2000 chars as context
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000).trim();
      prod._urlContext = text;
      console.log(`  [form] URL fetched (${text.length} chars): ${process.env.USER_URL}`);
    }
  } catch (e) { console.log(`  [form] URL fetch failed: ${e.message}`); }
}
if (process.env.USER_NOTES) {
  const notes = process.env.USER_NOTES;
  console.log(`  [form] user intel injected (${notes.length} chars) — evidence only, not in embed`);
  // Evidence point only — never inject into writeup fields (that would put raw user text into the embed)
  if (!Array.isArray(prod.evidence)) prod.evidence = [...(prod.evidence ?? [])];
  else prod.evidence = [...prod.evidence];
  prod.evidence.push({ source: 'User (dashboard)', date: new Date().toISOString().slice(0, 10), point: notes.slice(0, 300) });
  // Store as internal context for generateWriteup to reference — not emitted to embed directly
  prod._userNotes = notes;
}

// DealernetX One Piece query: DX titles read "<set name> Booster" (NO "Box") — appending
// "Box" returns 0. Use just the set name so DX matches; region/SKU filtering happens downstream.
if (!prod.dxQuery && (prod.category === 'one_piece' || prod.category === 'one-piece')) {
  const sn = prod.set ?? prod.setName ?? prod.label;
  if (sn) prod.dxQuery = String(sn).replace(/\b(booster|box|english|sealed)\b/gi, '').trim();
}

console.log(`Fetching live data for: ${prod.label}...`);
console.log(`  [internalDb] products map loaded — retail $${prod.retail ?? 'unknown'}`);

// Pre-resolve TCGPlayer product id for TCG categories so tcgPrice runs THIS run (not just next).
if (!prod.tcgId && ['pokemon', 'one_piece', 'other_tcg', 'mtg', 'lorcana'].includes(prod.category)) {
  try {
    const _s = await tcgProductSearch(prod.stockxQuery ?? prod.label, { category: prod.category });
    if (_s?.productId) { prod.tcgId = parseInt(_s.productId, 10) || _s.productId; if (!prod.images?.length) prod.images = [_s.productId]; console.log(`  [tcg-pre] resolved tcgId ${prod.tcgId}`); }
  } catch (e) { /* best-effort */ }
}

// ── Run all data sources in parallel ─────────────────────────────────────────
const [tcgRaw, pcPriceRaw, checklistRaw, signalsRaw, feedRaw] = await Promise.all([
  prod.tcgId ? tcgPrice(prod.tcgId) : Promise.resolve(prod.liveMarket ?? null),
  prod.pcExclusive?.tcgId ? tcgPrice(prod.pcExclusive.tcgId) : Promise.resolve(null),
  prod.checklistUrl ? checklistSignal(prod.checklistUrl, prod.boxConfig).then(c => { if (c) console.log(`Checklist: ${c.tiers.length} tiers | autos: ${c.autoSubjects} | est boxes: ${c.estimatedBoxes}`); return c; }) : Promise.resolve(null),
  DEEP ? deepResearch(prod.ebayQuery, prod.categoryId ?? 1561, { walmartItemId: prod.walmartItemId, dxQuery: prod.dxQuery, upc: prod.upc, retailFloor: prod.retail, redditQuery: prod.redditQuery, redditSubreddit: prod.redditSubreddit, queryVariants: buildQueryVariants(prod) }) : Promise.resolve(null),
  DEEP ? feedIntelSignal(50).then(f => { if (f) console.log(`  [feed] ${f.totalCheckouts} checkouts | hot: ${f.hotProducts.slice(0,3).join(', ')}`); return f; }).catch(() => null) : Promise.resolve(null),
]);

const tcg       = tcgRaw;
const pcPrice   = pcPriceRaw;
const checklist = checklistRaw;
const signals   = signalsRaw;
const feedIntel = feedRaw;

// ── USER_NOTES signal overrides ────────────────────────────────────────────────
// Free-text analyst corrections — treated like a chat message from the user.
// Handles: "amazon: N/A", "walmart incorrect", "retail is $6.99", "ebay wrong", "market $15"
if (prod._userNotes && signals) {
  const n = prod._userNotes;
  const srcRx = src => new RegExp(`${src}[^\\d$\n]{0,30}\\$?([\\d,]+\\.?\\d*)`, 'i');
  const naRx  = src => new RegExp(`${src}[^\\n]{0,60}(?:n\\/a|incorrect|wrong|skip|ignore|not valid|oos|off|bad|remove)`, 'i');
  for (const src of ['amazon', 'walmart', 'target', 'stockx', 'ebay']) {
    if (!n.toLowerCase().includes(src)) continue;
    if (naRx(src).test(n)) {
      signals[src] = null;
      console.log(`  [notes-override] ${src} → nulled (user: incorrect/N/A)`);
    } else {
      const pm = n.match(srcRx(src));
      if (pm) {
        const price = parseFloat(pm[1].replace(/,/g, ''));
        signals[src] = { ...(signals[src] ?? {}), price, inStock: true };
        console.log(`  [notes-override] ${src} price → $${price} (user correction)`);
      }
    }
  }
  // Retail override: "retail is $6.99" / "retail: $6.99" / "msrp $6.99"
  const retailM = n.match(/(?:retail(?:\s+is)?|msrp)[^\d$\n]{0,20}\$?([\d,]+\.?\d*)/i);
  if (retailM) {
    const price = parseFloat(retailM[1].replace(/,/g, ''));
    if (price > 0) { prod.retail = price; console.log(`  [notes-override] retail → $${price} (user correction)`); }
  }
  // Market override: "market is $X" / "market: $X" / "secondary $X"
  const mktM = n.match(/(?:market(?:\s+is)?|secondary)[^\d$\n]{0,20}\$?([\d,]+\.?\d*)/i);
  if (mktM) {
    const price = parseFloat(mktM[1].replace(/,/g, ''));
    if (price > 0) { prod._userMarket = price; console.log(`  [notes-override] market → $${price} (user correction)`); }
  }
}

if (signals) {
  console.log('Signals:', {
    reddit:    signals.reddit    ? `${signals.reddit.mentions} mentions, sentiment ${signals.reddit.sentiment}` : 'N/A',
    x:         signals.x         ? `${signals.x.count} tweets, sentiment ${signals.x.sentiment}` : 'N/A',
    instagram: signals.instagram ? `${signals.instagram.count} posts` : 'N/A',
    facebook:  signals.facebook  ? `${signals.facebook.count} posts, sentiment ${signals.facebook.sentiment}` : 'N/A',
    discord:   signals.discord   ? `${signals.discord.mentions} mentions` : 'N/A',
    whatnot:   signals.whatnot   ? `${signals.whatnot.count} listings, sentiment ${signals.whatnot.sentiment}` : 'N/A',
    ebay:      signals.ebay      ? `median $${signals.ebay.median} (sold30 ${signals.ebay.sold30 ?? 'n/a'} / sold90 ${signals.ebay.sold90 ?? 'n/a'} / active ${signals.ebay.activeCount ?? 'n/a'})` : 'N/A',
    walmart:   signals.walmart   ? `$${signals.walmart.price ?? 'N/A'} (${signals.walmart.inStock ? 'in stock' : 'OOS'})` : 'N/A',
    amazon:    signals.amazon    ? `$${signals.amazon.price ?? 'N/A'} (${signals.amazon.inStock ? 'in stock' : 'OOS'})` : 'N/A',
    wholesale: signals.historicalWholesale?.length ? `${signals.historicalWholesale.length} results (prior year)` : 'N/A',
    stockx:    signals.stockx    ? `$${signals.stockx.price} (ask $${signals.stockx.lowestAsk ?? 'n/a'} / bid $${signals.stockx.highestBid ?? 'n/a'})${signals.stockx.msrp ? ` MSRP $${signals.stockx.msrp}` : ''}` : 'N/A (no key)',
  });
}

// ── StockX MSRP auto-fill: if retail still null and StockX returned an msrp, use it ─────────
// StockX displays "Retail Price" on every product page — verified source, not a guess.
if (!prod.retail && signals?.stockx?.msrp) {
  prod.retail = signals.stockx.msrp;
  prod.retailVerified = true;
  prod.retailSource = `StockX MSRP — ${signals.stockx.urlKey ? `stockx.com/${signals.stockx.urlKey}` : 'stockx.com'}`;
  console.log(`  [retail-auto] StockX MSRP → $${prod.retail} (verified)`);
  // Persist to dynamic-products.json so future runs don't re-probe
  if (existsSync(_dynamicPath)) {
    try {
      const _dp = JSON.parse(readFileSync(_dynamicPath, 'utf8'));
      if (_dp[productKey]) {
        _dp[productKey].retail = prod.retail;
        _dp[productKey].retailVerified = true;
        _dp[productKey].retailSource = prod.retailSource;
        writeFileSync(_dynamicPath, JSON.stringify(_dp, null, 2) + '\n');
      }
    } catch (e) { console.log('  [retail-auto] persist failed:', e.message); }
  }
}

// ── #2: resolveRetail — multi-source probe when not yet verified ──────────────
// Runs StockX (already in signals) → TCGPlayer listing → CoolStuffInc → TrollAndToad.
// Requires ≥2 sources to agree within 10%. Never guesses — treats single-source as unverified.
// #3: if preRelease and all probes fail, fall back to estimatedRetail from comp median DB.
let _estimatedRetail = null;  // #3: only set for pre-release with no live verified source
if (!prod.retailVerified) {
  try {
    const _rr = await _resolveRetail(prod, signals);
    if (_rr.retail && _rr.retailVerified) {
      prod.retail = _rr.retail;
      prod.retailVerified = true;
      prod.retailSource = _rr.retailSource;
      console.log(`  [resolve-retail] → $${prod.retail} verified`);
      // Persist verified retail to dynamic-products.json
      if (existsSync(_dynamicPath)) {
        try {
          const _dp = JSON.parse(readFileSync(_dynamicPath, 'utf8'));
          if (_dp[productKey]) {
            _dp[productKey].retail = prod.retail;
            _dp[productKey].retailVerified = true;
            _dp[productKey].retailSource = prod.retailSource;
            writeFileSync(_dynamicPath, JSON.stringify(_dp, null, 2) + '\n');
          }
        } catch (e) { console.log('  [resolve-retail] persist failed:', e.message); }
      }
    } else if (_rr.estimatedRetail && prod.preRelease) {
      // #3: pre-release only — use estimatedRetail for embed display, NEVER for ROI
      _estimatedRetail = _rr.estimatedRetail;
      console.log(`  [resolve-retail] estimatedRetail $${_estimatedRetail.price} (pre-release fallback — NOT used in ROI)`);
    } else if (_rr._unverifiedHint) {
      console.log(`  [resolve-retail] ⚠️ unverified hint $${_rr._unverifiedHint} — blocked from ROI`);
    }
  } catch (e) { console.log('  [resolve-retail] probe error:', e.message); }
}

// ── Compute market price: weighted average of all live sources ────────────────
// Only include Amazon/Walmart if price is above retail (secondary, not retail listing)
const ebayMedian  = signals?.ebay?.median ?? null;

// Detect retail when prod.retail is null: use the lowest in-stock price that could be MSRP.
// An in-stock price near eBay median is a secondary match (not retail) — only use if << ebayMedian.
const _azRaw  = signals?.amazon?.price  ?? null;
const _wmRaw  = signals?.walmart?.price ?? null;
const _tgRaw  = signals?.target?.price  ?? null;
const _azInS  = signals?.amazon?.inStock  ?? false;
const _wmInS  = signals?.walmart?.inStock ?? false;
const _tgInS  = signals?.target?.inStock  ?? false;
// Detected retail: must be < ebayMedian * 0.8 (otherwise it's a secondary listing) AND > $1
const _ebayFloor = ebayMedian ?? Infinity;
const detectedRetail = prod.retail
  ?? (_tgInS && _tgRaw  && _tgRaw  > 1 && _tgRaw  < _ebayFloor * 0.8 ? _tgRaw  : null)
  ?? (_azInS && _azRaw  && _azRaw  > 1 && _azRaw  < _ebayFloor * 0.8 ? _azRaw  : null)
  ?? (_wmInS && _wmRaw  && _wmRaw  > 1 && _wmRaw  < _ebayFloor * 0.8 ? _wmRaw  : null)
  ?? null;
// Use detectedRetail as the effective retail for all downstream calculations
const effectiveRetail = detectedRetail ?? prod.retail ?? null;

// ── #1 Prior-version comp ──────────────────────────────────────────────────────
// When a product is brand-new with no/thin current sold data, the handbook says comp
// PRIOR VERSIONS of the same line (vol.6, OP-12, last chapter…). Explicit prod.siblingQuery
// wins; else auto-derive the base line by stripping the trailing vol/number/set-code.
let priorComp = null;
const _curSold   = (signals?.ebay?.sold30 ?? 0) + (signals?.ebay?.sold90 ?? 0);
const _isTCGcat  = ['pokemon','one_piece','other_tcg','mtg','lorcana'].includes((prod.category ?? '').toLowerCase());
// Future-dated release: its OWN comps don't exist yet — eBay matches are prior versions.
const _releaseFuture = (() => { const d = Date.parse(prod.releaseDate ?? ''); return Number.isFinite(d) && d > Date.now(); })();
if (_isTCGcat && (!ebayMedian || _curSold < 3 || (prod.preRelease && _releaseFuture))) {
  const baseQ = (prod.siblingQuery ?? (prod.ebayQuery || prod.label || ''))
    .replace(/\b(vol\.?\s*\d+|v\d+)\b/ig, '')
    .replace(/\b(OP|EB|PRB|ST|DP)-?\d{1,3}[a-z]?\b/ig, '')
    .replace(/\benglish sealed\b/ig, '')
    .replace(/\b\d{1,3}\b/g, '')
    .replace(/\s+/g, ' ').trim();
  if (baseQ && baseQ.length > 4) {
    try {
      const sib = await ebaySold(`${baseQ} English sealed`, { retailFloor: effectiveRetail ?? prod.retail ?? 0 });
      if (sib?.median) {
        priorComp = { query: baseQ, median: sib.median, count: sib.count, low: sib.low, high: sib.high };
        console.log(`  [prior-version] "${baseQ}" → median $${sib.median} (${sib.count} sold) — no/thin current data, using prior-line comp`);
      }
    } catch {}
  }
}
prod._priorComp = priorComp;

// Use best-matching wholesale result (skip variants >2× retail to avoid PC Exclusive polluting standard ETB avg)
const hwBest      = signals?.historicalWholesale?.find(p => p.market?.avgTrade && p.market.avgTrade < (effectiveRetail ?? 999) * 5) ?? signals?.historicalWholesale?.[0];
const hwTrades    = (hwBest?.market?.trades ?? []).map(t => t.price).filter(p => p > 0);
const hwAvg       = hwTrades.length ? hwTrades.reduce((s, p) => s + p, 0) / hwTrades.length : null;
const hwAsk       = (Number.isFinite(hwBest?.market?.lowestAsk) && hwBest.market.lowestAsk > 0 && effectiveRetail && hwBest.market.lowestAsk > effectiveRetail) ? hwBest.market.lowestAsk : null;
// 3P sanity ceiling — a price far above the eBay sold floor (or > retail×3 when no eBay)
// is a wrong-product match, not a real secondary listing. Reject it.
const secCeiling  = ebayMedian ? ebayMedian * 1.5 : (effectiveRetail ?? 0) * 3;
const azSec       = (effectiveRetail && _azRaw && _azRaw > effectiveRetail * 1.1 && _azRaw <= secCeiling) ? _azRaw : null;
const wmSec       = (effectiveRetail && _wmRaw && _wmRaw > effectiveRetail * 1.1 && _wmRaw <= secCeiling) ? _wmRaw : null;
const tcgMarket   = tcg?.market ?? null;
// StockX: drop when ask/bid spread > 50% (illiquid, one-listing midpoint is meaningless),
// or when the quote blows past the eBay sold floor (stale/aspirational ask).
const sxRaw       = signals?.stockx ?? null;
const sxSpreadBad = sxRaw?.lowestAsk && sxRaw?.highestBid && (sxRaw.lowestAsk - sxRaw.highestBid) / sxRaw.highestBid > 0.5;
// sxTooHigh: only apply when eBay median is credible (>= 60% of retail = plausible box match).
// If eBay median < 60% of retail, eBay likely matched packs/wrong-SKU — don't let it cap StockX.
const _ebayCredible = !ebayMedian || !effectiveRetail || ebayMedian >= effectiveRetail * 0.7;
const sxTooHigh   = _ebayCredible && ebayMedian && sxRaw?.price && sxRaw.price > ebayMedian * 1.5;
const sxPrice     = (sxRaw?.price && !sxSpreadBad && !sxTooHigh) ? sxRaw.price : null;

// PriceCharting source — read the already-indexed sealed-price history from the category
// set-history DB (no live scrape). Match product → set, take booster-box current sealed price.
let pcDbPrice = null;
try {
  const DB_BY_CAT = { pokemon:'set-history.json', mtg:'set-history-mtg.json', lorcana:'set-history-lorcana.json', sports:'set-history-sports.json', topps:'set-history-sports.json', disney_cards:'set-history-disney-cards.json', other_tcg:'set-history-other-tcg.json', one_piece:'set-history-one-piece.json', 'one-piece':'set-history-one-piece.json', weiss:'set-history-weiss.json', union_arena:'set-history-union-arena.json', gundam:'set-history-gundam.json', yugioh:'set-history-yugioh.json', cardfight:'set-history-cardfight.json', dragon_ball:'set-history-dragon-ball.json', fab:'set-history-fab.json', digimon:'set-history-digimon.json', sorcery:'set-history-sorcery.json', star_wars:'set-history-star-wars.json', hololive:'set-history-hololive.json', lego:'set-history-lego.json', noncard:'set-history-noncard.json', veefriends:'set-history-veefriends.json' };
  const dbFile = DB_BY_CAT[prod.category];
  if (dbFile && existsSync(join(ROOT, dbFile))) {
    const db = JSON.parse(readFileSync(join(ROOT, dbFile), 'utf8'));
    const sets = db.sets ?? db;
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    // Extract canonical set code from ANY string: "OP-10"/"OP10"/"OP 10"/"op 10 booster box" → "op10".
    // Works for One Piece (OP), MTG (set codes), etc — grabs <2-4 letters><1-3 digits>.
    const codeOf = s => { const m = String(s ?? '').match(/\b([a-z]{1,4})[\s-]?(\d{1,3})\b/i); return m ? norm(m[1] + m[2]) : ''; };
    const want = norm(prod.set ?? prod.setName ?? prod.label);
    const code = norm(prod.setCode ?? prod.code) || codeOf(prod.set ?? prod.label ?? prod.setName);
    let hit = null;
    // Direct _dbKey lookup first — avoids fuzzy-match false positives (e.g. "art-series-final-fantasy" before "final-fantasy").
    if (prod._dbKey && sets[prod._dbKey]) { hit = sets[prod._dbKey]; }
    if (!hit) for (const v of Object.values(sets)) {
      const nm = norm(v.name), cd = norm(v.code ?? v.setCode) || codeOf(v.code ?? v.name);
      if ((want && nm && (nm === want || (nm.length > 4 && want.includes(nm)) || (want.length > 4 && nm.includes(want)))) || (code && cd && cd === code)) { hit = v; break; }
    }
    // Prefer the collector/premium product key, then booster-box, then first product.
    // p.current = PriceCharting-style; p.market = TCGCSV-style — try both.
    const _prodKeys = Object.keys(hit?.products ?? {});
    const _prefKey  = _prodKeys.find(k => /collector.*booster.*display|collector.*box/i.test(k))
                   ?? _prodKeys.find(k => /booster.?box|booster.?display/i.test(k))
                   ?? _prodKeys[0];
    const p = hit?.products && (hit.products[_prefKey]);
    const _pcVal = p?.current ?? p?.market ?? null;
    if (_pcVal) { pcDbPrice = _pcVal; console.log(`  [pricecharting] ${hit.name} [${_prefKey}] $${pcDbPrice} (indexed DB)`); }
  }
} catch (e) { /* DB lookup best-effort */ }

// ── Chase cards from local tcgcsv DB ─────────────────────────────────────────
// For any TCG category (pokemon/mtg/one_piece/lorcana/other_tcg), pull top 5 cards
// by market price from the set's fullCardList in the local set-history DB.
// Used in market analysis to surface the actual chase singles driving sealed demand.
let dbChaseCards = [];
try {
  const TCG_CATS_CHASE = { pokemon:'set-history.json', mtg:'set-history-mtg.json', lorcana:'set-history-lorcana.json', other_tcg:'set-history-other-tcg.json', one_piece:'set-history-one-piece.json', 'one-piece':'set-history-one-piece.json' };
  const _chaseDbFile = TCG_CATS_CHASE[prod.category?.toLowerCase()];
  if (_chaseDbFile && existsSync(join(ROOT, _chaseDbFile))) {
    const _chaseDb = JSON.parse(readFileSync(join(ROOT, _chaseDbFile), 'utf8'));
    const _chaseSets = _chaseDb.sets ?? _chaseDb;
    const _chaseNorm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const _chaseWant = _chaseNorm(prod.set ?? prod.setName ?? prod.label);
    const _chaseCode = _chaseNorm(prod.setCode ?? prod.code ?? '');
    const _codeOf = s => { const m = String(s ?? '').match(/\b([a-z]{1,4})[\s-]?(\d{1,3})\b/i); return m ? _chaseNorm(m[1] + m[2]) : ''; };
    let _chaseHit = null;
    for (const v of Object.values(_chaseSets)) {
      const nm = _chaseNorm(v.name ?? v.set_name), cd = _chaseNorm(v.code ?? v.setCode) || _codeOf(v.name ?? '');
      if ((_chaseWant && nm && (nm === _chaseWant || (_chaseWant.length > 4 && nm.includes(_chaseWant)) || (nm.length > 4 && _chaseWant.includes(nm)))) || (_chaseCode && cd && cd === _chaseCode)) { _chaseHit = v; break; }
    }
    const _fcl = _chaseHit?.cards?.fullCardList ?? [];
    if (_fcl.length) {
      dbChaseCards = _fcl
        .filter(c => c.market > 0)
        .sort((a, b) => (b.market ?? 0) - (a.market ?? 0))
        .slice(0, 5)
        .map(c => ({ name: c.name, market: c.market, rarity: c.rarity ?? null }));
      if (dbChaseCards.length) console.log(`  [chase-db] ${_chaseHit.name ?? _chaseHit.set_name}: top chase — ${dbChaseCards.map(c => `${c.name} $${c.market}`).join(' | ')}`);
    }
  }
} catch (e) { /* chase DB best-effort */ }

// ── JP Leading Indicator (Pokemon only) ──────────────────────────────────────
// Japanese sets release 3-6mo before English counterparts.
// JP secondary market = forward signal for EN sealed demand.
// Rule: JP >2× retail = strong IP signal → EN sealed likely to run; JP at/below retail = weak IP → EN likely soft.
const isPokemon = prod.set?.toLowerCase().includes('mega evolution') || prod.set?.toLowerCase().includes('sv') || prod.set?.toLowerCase().includes('pokemon') || prod.label?.toLowerCase().includes('pokémon') || prod.label?.toLowerCase().includes('pokemon') || prod.category === 'pokemon';
let jpLeadSignal = null;
if (isPokemon) {
  try {
    const _jpDb = existsSync(join(ROOT, 'set-history-pokemon-jp.json'))
      ? JSON.parse(readFileSync(join(ROOT, 'set-history-pokemon-jp.json'), 'utf8'))
      : null;
    if (_jpDb) {
      const _jpSets = _jpDb.sets ?? {};
      const _norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const _want = _norm(prod.set ?? prod.setName ?? prod.label);
      const _code = _norm(prod.setCode ?? prod.code ?? '');
      // Match by set code (SV8a → look for SV8a in JP) or name fragment
      let _jpHit = null;
      for (const [k, v] of Object.entries(_jpSets)) {
        const nm = _norm(v.name ?? k);
        const cd = _norm(v.code ?? v.setCode ?? k);
        if ((_code && (cd.includes(_code) || _code.includes(cd))) ||
            (_want.length > 4 && (nm.includes(_want) || _want.includes(nm)))) {
          _jpHit = v; break;
        }
      }
      if (_jpHit) {
        const _jpSealed = _jpHit.cards?.sealed ?? [];
        const _jpBox = _jpSealed.find(p => /booster.*box|box/i.test(p.name ?? ''));
        const _jpMarket = _jpBox?.market ?? _jpHit.market ?? null;
        const _jpRetail = _jpBox?.retail ?? _jpHit.retail ?? null;
        const _jpMult = (_jpMarket && _jpRetail) ? _jpMarket / _jpRetail : null;
        const _jpChase = (_jpHit.cards?.fullCardList ?? [])
          .filter(c => c.market > 0).sort((a, b) => b.market - a.market).slice(0, 3)
          .map(c => `${c.name} ¥${(c.market * 150).toFixed(0)}`).join(' · ');
        jpLeadSignal = {
          setName: _jpHit.name ?? Object.keys(_jpSets).find(k => _jpSets[k] === _jpHit),
          market: _jpMarket, retail: _jpRetail, mult: _jpMult,
          topChase: _jpChase || null,
          signal: !_jpMult ? 'no data' : _jpMult >= 2 ? 'STRONG 🟢' : _jpMult >= 1.3 ? 'MODERATE 🟡' : 'WEAK 🔴',
        };
        console.log(`  [jp-lead] ${jpLeadSignal.setName}: ${jpLeadSignal.signal} (${_jpMult?.toFixed(2) ?? '?'}× retail)`);
      }
    }
  } catch (e) { /* JP signal best-effort */ }
}

const priceSources = [
  ebayMedian && _ebayCredible && { label: 'eBay median',      price: ebayMedian, weight: 40 },
  Number.isFinite(hwAvg) && hwAvg > 0 && (!ebayMedian || hwAvg >= ebayMedian * 0.5) && { label: 'DX prior-yr avg', price: hwAvg, weight: 30 },
  Number.isFinite(hwAsk) && hwAsk > 0 && (!ebayMedian || hwAsk <= ebayMedian * 2) && { label: 'DX lowest ask', price: hwAsk, weight: 15 },
  azSec      && (_ebayCredible ? (azSec >= ebayMedian * 0.5 && azSec <= ebayMedian * 2) : true) && { label: 'Amazon 3P',        price: azSec,      weight:  7 },
  wmSec      && (_ebayCredible ? (wmSec >= ebayMedian * 0.5 && wmSec <= ebayMedian * 2) : true) && { label: 'Walmart 3P',       price: wmSec,      weight:  8 },
  tcgMarket && (_ebayCredible ? tcgMarket <= ebayMedian * 2 : true) && (!effectiveRetail || tcgMarket >= effectiveRetail * 0.5) && { label: 'TCGPlayer', price: tcgMarket, weight: 35 },
  sxPrice    && { label: 'StockX',           price: sxPrice,    weight: 20 },
  pcDbPrice  && (_ebayCredible ? (pcDbPrice >= ebayMedian * 0.5 && pcDbPrice <= ebayMedian * 2) : true) && { label: 'PriceCharting',    price: pcDbPrice,  weight: 30 },
].filter(Boolean);

let market, marketNote;
if (priceSources.length) {
  const totalWeight = priceSources.reduce((s, src) => s + src.weight, 0);
  const wavg = priceSources.reduce((s, src) => s + src.price * src.weight, 0) / totalWeight;
  market     = Math.round(wavg * 100) / 100;
  marketNote = priceSources.map(s => `${s.label} $${s.price.toFixed(0)}`).join(' · ');
  console.log(`Market (weighted avg): $${market} — ${marketNote}`);
} else {
  market     = null;
  marketNote = prod.liveMarket?.note ?? 'no live data';
}
// Pre-release products: no verified sealed sold comps exist — live eBay match is the
// wrong SKU (set boxes vs SL bundle). Suppress market/ROI so embed shows projection only.
// Exception: if eBay sold data exists with real volume (sold30>5 OR sold90>10), product is
// live on secondary — treat it as released regardless of the preRelease flag.
const _ebayHasRealSales = (signals?.ebay?.sold30 > 5) || (signals?.ebay?.sold90 > 10) || (signals?.ebay?.count > 10);
// A FUTURE-dated release can't have its OWN sold comps — eBay matches are prior versions/
// pre-order asks, NOT this SKU. Never let those flip a confirmed-future pre-order to "released".
// (_releaseFuture computed above near the prior-version comp block.)
if (prod.preRelease && (_releaseFuture || !_ebayHasRealSales)) {
  market = null;
  marketNote = _releaseFuture ? 'pre-release — ships ' + prod.releaseDate + ', comp = prior versions' : 'pre-release — no verified sold comps';
}
// Pre-release with a prior-version comp: use that median as the PROJECTED market so the
// tier/ROI compute off the appreciation template (clearly labeled — not this SKU's own sales).
// Live prior-comp scrape is flaky, so fall back to a stored prod.projectedMarket anchor.
if (!market && priorComp?.median) {
  market = priorComp.median;
  marketNote = `prior-version projection — "${priorComp.query}" median $${priorComp.median} (${priorComp.count} sold); this SKU ships ${prod.releaseDate ?? 'TBD'}`;
} else if (!market && prod.projectedMarket) {
  market = prod.projectedMarket;
  marketNote = `prior-version projection — stored anchor $${prod.projectedMarket}${prod.projectedNote ? ` (${prod.projectedNote})` : ''}; this SKU ships ${prod.releaseDate ?? 'TBD'}`;
}
// User market override from corrections box
if (prod._userMarket) { market = prod._userMarket; marketNote = 'user-corrected market'; }

// Use eBay sold comps for range — clamp to median ±60% to filter outlier mis-matches
const _ebayLow  = signals?.ebay?.low;
const _ebayHigh = signals?.ebay?.high;
const low   = ebayMedian && _ebayLow  ? Math.round(Math.max(_ebayLow,  ebayMedian * 0.4) * 100) / 100 : null;
const high  = ebayMedian && _ebayHigh ? Math.round(Math.min(_ebayHigh, ebayMedian * 1.6) * 100) / 100 : null;
const sales = signals?.ebay?.count ?? tcg?.sales ?? null;

const salesTax  = prod.salesTax ?? 0.08;
// #1 DISPLAY enforcement: profitability embed fields only show when retailVerified === true.
// Unverified retail MUST NOT appear as "profit" to the user — we never display a guessed ROI.
// retail2 (user-supplied promo deal price) bypasses this gate.
const _roiRetail = prod.retailVerified === true ? prod.retail : null;
const costBasis  = (_roiRetail != null || prod.retail2 != null)
  ? (prod.retail2 ?? _roiRetail) * (1 + salesTax)
  : null;
const ebayFee   = prod.ebayFee ?? 0.13;
const netProfit = (market && costBasis != null) ? (market * (1 - ebayFee) - costBasis) : null;
const roi       = (netProfit != null && costBasis) ? Math.round((netProfit / costBasis) * 100) : null;

// RATING cost basis: uses prod.retail even if unverified — internal scoring only, never displayed.
// Separation: display (costBasis above) requires verification; scoring (below) uses best available data.
const _scoringRetail = prod.retail2 ?? prod.retail ?? null;
const _scoringCostBasis = _scoringRetail != null ? _scoringRetail * (1 + salesTax) : null;
const _scoringNetProfit = (market && _scoringCostBasis) ? (market * (1 - ebayFee) - _scoringCostBasis) : null;
const _scoringRoi = (_scoringNetProfit != null && _scoringCostBasis) ? Math.round((_scoringNetProfit / _scoringCostBasis) * 100) : null;

let riskResult = null;
if (signals) {
  riskResult = computeRisk({ profitabilityRoi: roi ?? 0, supplyScore: prod.supplyScore ?? 12, signals });
  console.log('Risk:', riskResult);
}

// ── Compute labels before building fields ──────────────────────────────────────
const profitBallEarly = roi >= 25 ? '🟢' : roi >= 10 ? '🟡' : '🔴';
const marketMultiple  = (market && prod.retail) ? +(market / prod.retail).toFixed(2) : null;
// forceRisk overrides the auto-computed label when the thesis risk differs from the
// signal-derived score (e.g. LEGO at deal price reads "safe" on ROI but the hold is fragile).
const riskLabelEarly  = prod.forceRisk ?? (riskResult ? riskResult.label : prod.risk);

// ── Build fields ───────────────────────────────────────────────────────────────
const fields = [];

// Top block — 5 stacked info lines
// Row 1: Retail | Market | Risk Level
// retail2 = live deal/sale price (e.g. Walmart+ special) — show it with MSRP struck so the
// embed never misreads a discounted entry as full retail.
// Market display: live weighted market → else authored presale/scraped market → only
// "Awaiting" if literally zero pricing data exists anywhere. Presale market is the most
// accurate read for pre-release products, so always surface it.
const marketDisplay = market ? fmt$(market) : (prod.presaleMarket ?? '`Awaiting live data`');
const retailDisplay = prod.retail2
  ? `${fmt$(prod.retail2)} (${prod.dealNote ?? 'sale'} · MSRP ${fmt$(prod.retail)})`
  : (prod.retail && prod.retailVerified)
  ? fmt$(prod.retail)
  : prod.retail
  ? `${fmt$(prod.retail)} ⚠️`   // unverified — shown but flagged
  : detectedRetail
  ? fmt$(detectedRetail)
  : _estimatedRetail
  ? `~${fmt$(_estimatedRetail.price)} (est.)`  // #3: pre-release extrapolation from comp median
  : '`N/A`';
// _dte/_reprisk/_riskSuffix computed after ratingResult — see below
let riskDisplay = riskLabelEarly; // placeholder, overwritten after ratingResult

fields.push({ name: '💰 Retail',      value: retailDisplay, inline: true });
fields.push({ name: '📈 Market',      value: marketDisplay, inline: true });
fields.push({ name: '⚠️ Risk Level',  value: riskDisplay,   inline: true });
// Row 2: Market Range | eBay Comps | Release Date (release date pushed below if present)
if (low && high && !prod.preRelease) {
  fields.push({ name: '📊 Market Range', value: `${fmt$(low)} — ${fmt$(high)}`, inline: true });
}
const amazonUrl  = `https://www.amazon.com/s?k=${encodeURIComponent(prod.ebayQuery)}`;
const walmartUrl = `https://www.walmart.com/search?q=${encodeURIComponent(prod.ebayQuery)}`;
const tcgUrl     = prod.tcgId ? `https://www.tcgplayer.com/product/${prod.tcgId}` : (prod.releaseUrl ?? null);
const compsLinks = [`[eBay](${ebay(prod.ebayQuery)})`, `[Amazon](${amazonUrl})`, `[Walmart](${walmartUrl})`, tcgUrl ? `[TCG](${tcgUrl})` : null].filter(Boolean).join(' | ');
fields.push({ name: '🔗 Comps', value: compsLinks, inline: true });

// Amazon/Walmart: internal signal only — not shown in embed

if (pcPrice?.market && prod.pcExclusive) {
  fields.push({ name: `🏆 ${prod.pcExclusive.label}`, value: `Market **${fmt$(pcPrice.market)}** — ${prod.pcExclusive.note}`, inline: false });
}

if (prod.eolDate) {
  fields.push({ name: '📅 End of Life (EOL)', value: prod.eolDate, inline: true });
} else if (prod.releaseDate) {
  fields.push({ name: '🗓️ Release Date', value: prod.releaseDate, inline: true });
}

// Release Method field — Topps products only (EQL vs FCFS is critical for strategy)
if (prod.category === 'topps' || prod.category === 'sports' || prod.releaseMethod) {
  const method = prod.releaseMethod
    ?? (/EQL/i.test(prod.releaseDate ?? '') ? 'EQL — Equal Access Lottery' : /FCFS/i.test(prod.releaseDate ?? '') ? 'FCFS — First Come First Served' : null);
  if (method) fields.push({ name: '📋 Release Method', value: method, inline: true });
}

if (prod.stockNote) {
  fields.push({ name: '🏪 Stock / Drop Intel', value: prod.stockNote, inline: false });
}

// 📦 Contents removed — config lives in Product Analysis; contents was redundant.

// Checklist / box configuration (sports cards only)
if (checklist) {
  const cfg = checklist.boxConfig;
  const serialLine = checklist.serials.map(s => `${s.serial}${s.label ? ` ${s.label}` : ''}`).join(' · ');
  const autoTiers = checklist.tiers.filter(t => /auto/i.test(t.name));
  const tierLine = checklist.tiers.slice(0, 5).map(t => `${t.name} (${t.count})`).join(' · ');
  const printFloor = checklist.estimatedBoxes
    ? `~${checklist.estimatedBoxes.toLocaleString()} boxes — ${checklist.serials[0]?.serial} base serial × ${checklist.autoSubjects} ${checklist.autoTierName} subjects`
    : 'N/A';
  fields.push({
    name: '🃏 Box Config & Checklist',
    value: [
      `**${cfg.cardsPerBox} cards/box · ${cfg.autosPerBox} on-card auto/box**`,
      `**Serial tiers:** ${serialLine}`,
      `**Insert tiers:** ${tierLine}`,
      `**Base/SP subjects:** ${checklist.baseSubjects} | **Auto subjects:** ${checklist.autoSubjects ?? 'N/A'}`,
      `**Est. print run floor:** ${printFloor}`,
    ].join('\n'),
    inline: false,
  });
}

// Sell-through targets: keep authored numeric ranges + SKIP, but when a range is
// a non-numeric placeholder (e.g. "market-driven"), derive it from the live market.
const _hasNum = s => /\d/.test(s ?? '');
const _band   = (a, b) => `$${Math.round(a).toLocaleString()} – $${Math.round(b).toLocaleString()}`;
function _tier(t, lo, hi, useEbayBand) {
  if (!t || /^skip$/i.test(t.range ?? '') || _hasNum(t.range)) return t;   // leave SKIP + authored numbers
  if (!market) return t;                                                    // no market → can't compute
  const range = (useEbayBand && low && high) ? _band(low, high) : _band(market * lo, market * hi);
  return { ...t, range };
}
const st = prod.sellThrough ? {
  flip:   _tier(prod.sellThrough.flip,   0.95, 1.15, true),   // flip ≈ current eBay band
  hold:   _tier(prod.sellThrough.hold,   1.10, 1.40, false),  // hold = +10–40%
  invest: _tier(prod.sellThrough.invest, 1.40, 2.00, false),  // invest = +40–100%
} : prod.sellThrough;

const profitBall = profitBallEarly;
const riskLabel  = riskLabelEarly;

// T+14 / T+30 projected profitability — all sources feed momentum
const sentimentSum = signals ? (
  (signals.reddit?.sentiment    ?? 0) * 1.5 +
  (signals.x?.sentiment         ?? 0) +
  (signals.discord?.sentiment   ?? 0) * 1.5 +
  (signals.instagram?.sentiment ?? 0) +
  (signals.facebook?.sentiment  ?? 0) +
  (signals.google?.sentiment    ?? 0) +
  (signals.whatnot?.sentiment   ?? 0) * 1.5
) : 0;
const ebayTrend    = (signals?.ebay?.median && market) ? (signals.ebay.median - market) / market : 0;
// DealernetX prior-year avg trade vs current market = historical demand trend (reuse hwAvg from market computation)
const hwTrend      = (hwAvg && market) ? Math.max(-0.05, Math.min(0.05, (hwAvg - market) / market * 0.5)) : 0;
// Amazon/Walmart in-stock suppresses T+30 ceiling
const supplyDrag   = (signals?.amazon?.inStock || signals?.walmart?.inStock) ? -0.03 : 0;
const momentum14   = Math.max(-0.10, Math.min(0.15, (sentimentSum * 0.008) + ebayTrend + hwTrend + supplyDrag));
const momentum30   = Math.max(-0.15, Math.min(0.25, (sentimentSum * 0.012) + ebayTrend * 1.5 + hwTrend + supplyDrag));
const t14Market    = market ? Math.round(market * (1 + momentum14) * 100) / 100 : null;
const t30Market    = market ? Math.round(market * (1 + momentum30) * 100) / 100 : null;
const t14Net       = (t14Market && costBasis != null) ? (t14Market * (1 - ebayFee) - costBasis) : null;
const t30Net       = (t30Market && costBasis != null) ? (t30Market * (1 - ebayFee) - costBasis) : null;
const t14Roi       = (t14Net != null && costBasis) ? Math.round((t14Net / costBasis) * 100) : null;
const t30Roi       = (t30Net != null && costBasis) ? Math.round((t30Net / costBasis) * 100) : null;
const t14Ball      = t14Roi >= 25 ? '🟢' : t14Roi >= 10 ? '🟡' : '🔴';
const t30Ball      = t30Roi >= 25 ? '🟢' : t30Roi >= 10 ? '🟡' : '🔴';

// ── Compute rating dynamically (needs t30Roi + t30Market) ──────────────────────
// Use scoring ROI (uses prod.retail even unverified) so rating isn't degraded by the display gate.
// t30 scoring uses _scoringCostBasis equivalent: pick best of t30Roi (scoring) or _scoringRoi.
const _t30ScoringNet = (t30Market && _scoringCostBasis) ? (t30Market * (1 - ebayFee) - _scoringCostBasis) : null;
const _t30ScoringRoi = (_t30ScoringNet != null && _scoringCostBasis) ? Math.round((_t30ScoringNet / _scoringCostBasis) * 100) : null;
const ratingRoi      = (_t30ScoringRoi != null && _t30ScoringRoi > (_scoringRoi ?? 0)) ? _t30ScoringRoi : (_scoringRoi ?? 0);
const ratingMultiple = (t30Market && prod.retail) ? Math.max(marketMultiple ?? 1, +(t30Market / prod.retail).toFixed(2)) : (marketMultiple ?? 1);
const ratingResult   = computeRating({ roi: ratingRoi, marketMultiple: ratingMultiple, riskResult, signals, prod });
const _baseRating    = prod.forceRating ?? ratingResult.rating;

// ── Risk display suffix (requires ratingResult) ────────────────────────────
const _dte        = ratingResult?.daysToExit;
const _reprisk    = ratingResult?.reprintRisk;
const _riskSuffix = [
  _dte && _dte < 9999 ? `${_dte}d exit` : null,
  _reprisk === 'high' ? '⚠️ reprint risk' : _reprisk === 'none' ? '✅ fixed print' : null,
].filter(Boolean).join(' · ');
riskDisplay = _riskSuffix ? `${riskLabelEarly} · ${_riskSuffix}` : riskLabelEarly;

// ── Tier-adjusted send rating ─────────────────────────────────────────────────
// Set tier (S+/S/A/B/C/D) from category DB overrides send rating when they conflict.
// S+/S  → floor at GREEN  (proven set — can't be ORANGE/RED unless forced)
// A     → floor at ORANGE
// D     → cap  at ORANGE  (weak history — can't be DBLGREEN/GREEN)
// forceRating always wins over tier adjustment.
const _catScore  = prod.category !== 'pokemon' ? categorySetScore(prod) : null;
const _catTier   = _catScore ? categoryTierOf(_catScore.score) : null;

// Pre-compute Pokemon set tier outside IIFE so it's available for _tierLabel
// Uses computeSetScore (with live signals) to match what setComparison displays.
// Must run AFTER signals are gathered (deepResearch complete).
let _pokeTierOuter = null;
if (prod.category === 'pokemon') {
  try {
    const _ssRaw2 = JSON.parse(readFileSync(join(ROOT, 'set-scores.json'), 'utf8'));
    const _sets2  = _ssRaw2.sets ?? {};
    const _sk2 = prod._dbKey && _sets2[prod._dbKey] ? prod._dbKey
      : Object.keys(_sets2).filter(k => _sets2[k]?.scale !== 'vintage' && (prod.set?.includes(k) || prod.label?.includes(k))).sort((a,b)=>b.length-a.length)[0];
    if (_sk2) {
      const _me2 = _sets2[_sk2];
      // inline ipStrengthFor to avoid IP_STRENGTH const (not yet initialized)
      const _ip2 = _me2.ipStrength ?? 50;
      const _liveMult2 = market && prod.retail ? market / prod.retail : null;
      const _peak2 = Math.max(_me2.observedPeakMultiple ?? 0, _liveMult2 ?? 0);
      const _pp2 = Math.min(_peak2, 4) / 4 * 100;
      // liveDemandScore also uses IP_STRENGTH const — use simple eBay-sold proxy instead
      const _sold2 = signals?.ebay?.sold30 ?? signals?.ebay?.sold90 ?? signals?.ebay?.activeCount ?? 0;
      const _live2 = Math.min(_sold2 * 2.5, 100);
      const _score2 = Math.round(_ip2 * 0.5 + _live2 * 0.3 + _pp2 * 0.2);
      _pokeTierOuter = tierOf(_score2);
    }
  } catch (e) { console.warn('  [pokeTierOuter] error:', e.message); }
}

const computedRating = (() => {
  if (prod.forceRating) return prod.forceRating;
  const r = _baseRating;
  if (r === 'PURPLE') return r;                       // volume play — never remapped by set quality
  // Derive effective set tier: pokemon from set-scores.json (inline read — SET_SCORES not yet in scope), others from category-tiers
  let _pokeTier = null;
  if (prod.category === 'pokemon') {
    try {
      const _ssRaw = JSON.parse(readFileSync(join(ROOT, 'set-scores.json'), 'utf8'));
      const _sets = _ssRaw.sets ?? {};
      // longest match = most specific key (prevents 'Evolutions' shadowing 'Prismatic Evolutions')
      // skip vintage/non-pokemon entries (e.g. vintage "Pitch Black" ≠ ME05 Pitch Black)
      const _sk = (prod._dbKey && _sets[prod._dbKey] ? [prod._dbKey] :
        Object.keys(_sets).filter(k => _sets[k].scale !== 'vintage' && (prod.set?.includes(k) || prod.label?.includes(k)))
      ).sort((a,b)=>b.length-a.length)[0];
      if (_sk) {
        const _me = _sets[_sk];
        const _ip = _me.ipStrength ?? 50;
        const _peak = Math.min(_me.observedPeakMultiple ?? 1, 4) / 4 * 100;
        const _sc = Math.round(_ip * 0.625 + _peak * 0.375);
        _pokeTier = tierOf(_sc);
      }
    } catch { /* best-effort */ }
  }
  const _effectiveTier = _pokeTier ?? _catTier;
  if (!_effectiveTier) return r;
  const ORDER = ['RED','YELLOW','ORANGE','GREEN','DBLGREEN'];
  const ri = ORDER.indexOf(r);
  if (ri < 0) return r;
  if (_effectiveTier === 'S+' || _effectiveTier === 'S') return ORDER[Math.max(ri, ORDER.indexOf('GREEN'))];
  if (_effectiveTier === 'A')                            return ORDER[Math.max(ri, ORDER.indexOf('ORANGE'))];
  if (_effectiveTier === 'No Send')                      return ORDER[Math.min(ri, ORDER.indexOf('ORANGE'))];
  return r;
})();
console.log('Rating:', computedRating, prod.forceRating ? '(forced)' : `(ROI-tier ${ratingResult.tier ?? '?'}, set-tier ${_catTier ?? 'n/a'}, score ${ratingResult.score}, daysToExit ${ratingResult.daysToExit ?? 'n/a'}, reprint ${ratingResult.reprintRisk ?? 'n/a'}, dollarVol $${ratingResult.dollarVolume ?? 0})`, ratingResult.reasons);

// ── Tier-based sell-through percentages and bulk buy counts ───────────────────
const ST_PCT = {
  DBLGREEN: { flip: '50%', hold: '35%', invest: '15%' },
  GREEN:    { flip: '50%', hold: '35%', invest: '15%' },
  PURPLE:   { flip: '85%', hold: '15%', invest: '0%'  },  // volume play — churn fast, no hold
  ORANGE:   { flip: '70%', hold: '20%', invest: '10%' },
  YELLOW:   { flip: '85%', hold: '15%', invest: '0%'  },
  RED:      { flip: '100%', hold: '0%', invest: '0%'  },
};
const stPct = ST_PCT[computedRating] ?? ST_PCT.ORANGE;
const BULK_BUY_COUNTS = { DBLGREEN: '250+', GREEN: '100+', PURPLE: '250+', ORANGE: '<50', YELLOW: '<25', RED: '<10' };
const bulkBuyCount = prod.bulkBuy ?? BULK_BUY_COUNTS[computedRating];

// Auto-default risk to 🟢 Low for GREEN/DBLGREEN unless forceRisk explicitly set
if (!prod.forceRisk && (computedRating === 'DBLGREEN' || computedRating === 'GREEN')) {
  riskDisplay = '🟢 Low' + (_riskSuffix ? ` · ${_riskSuffix}` : '');
}

// TL;DR send label — tier shown inline: "🟢 FULL SEND | S Tier | $6.99 | $14.25"
// ROI tier (S/A/B/C/PASS) is the handbook tier — show it; fall back to set-quality tier.
// When forceRating is set, derive tier from it so tier and send label are consistent.
const FORCE_RATING_TIER = { DBLGREEN: 'S+', GREEN: 'A', PURPLE: 'A', ORANGE: 'C', YELLOW: 'C', RED: 'No Send' };
// Tier priority: actual set score always wins over forceRating-derived tier.
// forceRating controls SEND LABEL only; tier reflects actual set quality from DB score.
const _forceTier = prod.forceRating ? FORCE_RATING_TIER[prod.forceRating] : null;
const _tierLabel = _pokeTierOuter ?? _catTier ?? _forceTier ?? ratingResult?.tier ?? null;
const SEND_LABELS = {
  DBLGREEN: '🟢🟢 MEGA SEND',
  GREEN:    '🟢 FULL SEND',
  PURPLE:   '🟣 VOLUME SEND',
  ORANGE:   '🟠 LIGHT SEND',
  YELLOW:   '🟡 SMALL SEND',
  RED:      '🔴 NO SEND',
};
const sendLabel = SEND_LABELS[computedRating] ?? '🟠 LIGHT SEND';

// Sell-through with computed percentages
if (st?.flip) {
  fields.push({
    name: '🎯 Target Sell-Through',
    value: [
      `**Flip (<1 mo):** \`${st.flip.range}\` | ${stPct.flip}`,
      `**Hold (3 mo):**  \`${st.hold.range}\` | ${stPct.hold}`,
      /^skip$/i.test(st.invest.range)
        ? `**Invest (1 yr):** \`not advised\` — reprint/print-cycle risk; flip or 3-mo hold only`
        : `**Invest (1 yr):** \`${st.invest.range}\` | ${stPct.invest}`,
    ].join('\n'),
    inline: false,
  });
}

// Bottom columns
fields.push({ name: '📦 Bulk Buy Estimate',         value: `**${bulkBuyCount}**`,                                                                                              inline: true });
// Authored overrides (profitNow/profitLong) take precedence — used for pre-release where the
// auto net (suppressed market) would show N/A; estimate flip-now + long-hold from presale + scenarios.
// Never emit "N/A": when display gate nulls verified net, fall back to scoring net (best-available
// signal) so the field always carries a number. _scoringNetProfit uses prod.retail even if unverified.
const _nowNet  = netProfit ?? _scoringNetProfit;
const _nowMkt  = market || (prod.presaleMarket ? null : null);
const _nowBall = (_nowNet ?? 0) >= 25 ? '🟢' : (_nowNet ?? 0) >= 10 ? '🟡' : '🔴';
const _t30NetDisp  = t30Net ?? _t30ScoringNet ?? _scoringNetProfit;
const _t30BallDisp = (_t30NetDisp ?? 0) >= 25 ? '🟢' : (_t30NetDisp ?? 0) >= 10 ? '🟡' : '🔴';
fields.push({ name: '📈 Current Profitability',     value: prod.profitNow  ?? (_nowNet != null ? `${_nowBall} ${fmt$(_nowNet)}/unit | ${fmt$(market || prod.retail)} Est Sale` : (market ? `${fmt$(market)} Est Sale` : '`In price discovery`')), inline: true });
fields.push({ name: '📊 Long Term Profit (T+30)',   value: prod.profitLong ?? (_t30NetDisp != null ? `${_t30BallDisp} ${fmt$(_t30NetDisp)}/unit | ${fmt$(t30Market || market)} Est Sale` : (t30Market ? `${fmt$(t30Market)} Est Sale` : '`In price discovery`')),  inline: true });


// Dynamic supply-risk line — varies by THIS product's reprint risk + hold horizon, not a
// static sentence. The MPG-2028 capacity catalyst only matters to a genuine long hold.
const PRINT_RISK = (() => {
  const rr = ratingResult?.reprintRisk;
  if (computedRating === 'RED' || computedRating === 'YELLOW') return '';      // flip-only → 2028 irrelevant
  if (rr === 'high') return '⚠️ *Reprint risk is HIGH near-term — this line restocks fast; treat as a flip, do not hold into a reprint wave.*';
  const horizonHold = (computedRating === 'DBLGREEN' || computedRating === 'GREEN');
  return horizonHold
    ? '⚠️ *Hold thesis: fixed print supports the floor near-term, but Millennium Print Group\'s 1.27M sqft NC plant scales domestic capacity ~late 2028 — trim 12+ month holds before that supply lands.*'
    : '';
})();
// isPokemon declared earlier (before JP Leading Indicator block)

// ── Generate writeup from live signals (overrides static writeup when data available) ─
// ── Per-set intel: IP tier, trajectory, sentiment context ─────────────────────
// SET_INTEL: IP description + sentiment interpretation ONLY.
// trajectory is intentionally removed — computed live from signals in generateWriteup().
const SET_INTEL = {
  'Paldean Fates': {
    ip:        'Shiny Charizard ex is the primary anchor — shiny treatment on the most in-demand IP in the game. Shiny Gardevoir ex, Shiny Miraidon ex, and a full shiny vault round out the chase pool.',
    sentiment: 'Uniformly bullish. Shiny sets are a distinct collector category — the shiny treatment creates demand from collectors who already have standard versions. OOP status removes any supply pressure.',
    narrative: 'SV4.5 released Jan 2024, went OOP mid-2024. At $1,587 for the display (5.3× retail), this is the OOP appreciation curve playing out in real time. Shiny Charizard ex is the price anchor — as long as that card has demand, this display holds its floor.',
    ipTier:    'S',
  },
  'Mega Evolution': {
    ip:        'Mega Gardevoir ex is the primary demand anchor — massive competitive + collector crossover, one of the most sought-after Megas across both player and investor segments. Mega Lucario ex and Mega Venusaur ex (Gen 1) are secondary anchors. No Charizard in this set — that is ME02.',
    sentiment: 'Strong across competitive and collector segments. Gardevoir and Lucario have crossover demand that outlasts the initial release cycle — these are not hype-driven floors.',
    narrative: 'ME01 launched Sep 2025 as the first set in the Mega Evolution series. Ascended Heroes (ME2.5) is the IP leader of the line (Charizard Y + Blastoise + Dragonite debut); ME01 is the second-strongest on Gardevoir/Lucario crossover demand. First-in-line scarcity has kept ME01 display supply tight.',
    ipTier:    'A',
  },
  'Chaos Rising': {
    ip:        'Mega Greninja ex is the demand anchor — Gen 6 fan-favorite with sustained pull demand in all prior formats. Mega Floette ex and Mega Pyroar ex are secondary IPs.',
    sentiment: 'Community interest is real but Greninja has not historically driven a sustained secondary ceiling. Bullish sentiment reflects ME series enthusiasm, not set-specific demand — watch for premium formation only after retail shelves clear.',
    narrative: 'ME04 in the ME series lineup. Lower-IP anchor than the leaders (Ascended Heroes, ME05 Pitch Black). Secondary sitting near retail is the expected outcome for this tier — not a failure, just a structurally capped ceiling relative to the top of the series.',
    ipTier:    'B',
  },
  'Perfect Order': {
    ip:        'Mega Zygarde ex, Mega Clefable ex, Mega Starmie ex — weakest IP tier in the ME series. No Charizard/Darkrai/Eeveelution class driver to push a ceiling.',
    sentiment: 'Demand is ME series demand, not set-specific. Zygarde and Clefable do not carry collector floors that sustain premium once retail supply is available. Secondary ceiling is structurally limited.',
    narrative: 'ME03 is the weakest set in the ME lineup. Secondary stabilizing near retail is consistent with weak-IP sets in any series — Ascended Heroes (the ME line leader) carries perception of the whole series, which inflates interest in ME03 beyond what its IP alone warrants.',
    ipTier:    'C',
  },
  'Pitch Black': {
    ip:        'Mega Darkrai ex + Mega Zeraora ex — Gen 4/5 dark archetype IPs. Darkrai has sustained secondary value in every format it has appeared in; Gen 4 revival has been one of the strongest demand catalysts in recent years.',
    sentiment: 'Pre-release sentiment is strongly bullish. Darkrai nostalgia is a proven ceiling-driver, consistent with how Destined Rivals and Obsidian Flames traded on release. Expecting Day 1 secondary to form a strong floor.',
    narrative: 'ME05 is one of the strongest IP sets in the ME lineup behind Ascended Heroes (the line leader). Pre-release activity is validating demand ahead of Jul 17, 2026 launch — watch the first 48-hour secondary for real floor formation.',
    ipTier:    'A',
  },
  'Destined Rivals': {
    ip:        'Team Rocket\'s Mewtwo ex SIR is the primary anchor — one of the most expensive SV-era singles, held above $480 through early 2026. Cynthia\'s Garchomp ex, Ethan\'s Ho-Oh ex, Team Rocket\'s Moltres ex, plus the Giovanni / Ariana trainer SIRs round out the chase. Team Rocket nostalgia theme (45+ Rocket cards) is the demand engine — no Charizard in this set.',
    sentiment: 'Structurally bullish — Team Rocket\'s Mewtwo ex demand does not erode with time. Reprint cycles cause price compression, not demand collapse. Strong-IP sets rebound to new highs post-reprint; DR display boxes already proved this, trading from $250 early secondary to $600-650 today.',
    narrative: 'Now in a reprint cycle — expected for this IP class. Display boxes went from $250 early secondary to $600-650 today. The reprint dip is a buying window, not an exit. The Team Rocket roster (Mewtwo ex, Giovanni, Cynthia\'s Garchomp) carries the set the way evergreen anchors carry strong sets.',
    ipTier:    'S',
  },
  'Prismatic Evolutions': {
    ip:        'Eevee + all 8 Eeveelutions — strongest evergreen IP in modern Pokemon TCG. Multigenerational collector demand with no comparable ceiling in the SV era.',
    sentiment: 'Uniformly bullish. Multiple restock waves absorbed without sustained price collapse. IP depth means demand comes from collectors, investors, and players simultaneously — the broadest demand base of any current set.',
    narrative: 'Released Jan 2025, reprinted within 2 days, sustained 2.9x retail for 17 months. No SV-era set has held this level of premium through this much supply pressure. PE is the benchmark for what S+ IP looks like in the modern print era — and the ceiling has not been found.',
    ipTier:    'S+',
  },
  'Ascended Heroes': {
    ip:        'Mega Charizard Y ex + Mega Blastoise ex are the headline demand anchors. Mega Dragonite ex is the debut card — Gen 1 pseudo-legendary with no prior Mega ex, which adds scarcity premium beyond the standard chase. Mega Gardevoir ex appears here too (crossover from ME01 demand base).',
    sentiment: 'Uniformly bullish. Gen 1 and high-tier Gen 2 IP across the board. Secondary premiums held through heavy botter checkouts and broad retailer allocation — that is the signal. When supply pressure does not suppress price, the IP is doing real work.',
    narrative: 'ME2.5 released Jan 30, 2026 as a specialty-products-only set — no traditional booster box exists for this set. ETBs and specialty SKUs only. That supply constraint, combined with Charizard Y + Dragonite debut, puts this set in a different category than standard ME series releases.',
    ipTier:    'S',
  },
};

// ── Product type long-term appreciation tier ──────────────────────────────────
// Hierarchy validated via XY Evolutions 10-yr data: Display 24.4× > ETB 13.6×
// Exception: legacy Base Set reprint sets (XY Evolutions, Celebrations) where sealed packs carry grading premium
function productTypeTier(label) {
  if (/booster\s*(display|box)|display\s*box/i.test(label))  return { tier: 1, name: 'Booster Display Box', line: '• **Display Box** — highest long-term appreciation tier (Display 24× > ETB 13× validated via XY Evolutions 10yr data); distributor-only supply with no restock path' };
  if (/elite\s*trainer|ETB/i.test(label))                    return { tier: 2, name: 'ETB', line: '• **ETB** — second-highest appreciation tier (Display Box > **ETB** > Bundle > Blisters); strongest retail-to-secondary multiple for standard consumer format' };
  if (/booster\s*bundle|bundle/i.test(label))                return { tier: 3, name: 'Booster Bundle', line: '• **Booster Bundle** — mid-tier appreciation (Display > ETB > **Bundle** > Blisters); lower entry, faster flip cycle, ceiling below ETB' };
  if (/heavy\s*hitter|collection/i.test(label))              return { tier: 4, name: 'Collection', line: '• **Collection** — appreciation driven by promo/plush value; hold thesis weaker than ETB/Display, stronger than blisters' };
  if (/3[\s-]pack/i.test(label))                             return { tier: 5, name: '3-Pack Blister', line: '• **3-Pack Blister** — low appreciation ceiling (Display > ETB > Bundle > **3-Pack** > 2-Pack > Single); flip-only format' };
  if (/2[\s-]pack/i.test(label))                             return { tier: 6, name: '2-Pack Blister', line: '• **2-Pack Blister** — near-bottom appreciation; flip within 30 days only' };
  if (/blister|single\s*pack/i.test(label))                  return { tier: 7, name: 'Single Blister', line: '• **Single Blister** — lowest appreciation tier; retail arbitrage only, no hold thesis' };
  return null;
}

// ── Set comparison database (persistent — every researched set stored forever) ──
const _setScoresPath = join(ROOT, 'set-scores.json');
const _setScoresRaw  = existsSync(_setScoresPath) ? JSON.parse(readFileSync(_setScoresPath, 'utf8')) : {};
const SET_SCORES     = _setScoresRaw.sets ?? {};
const IP_STRENGTH    = _setScoresRaw.ipStrengthIndex ?? {};

// Pokemon TCG macro pulse (June 2026) — aggregate market state, refresh per session.
const MARKET_PULSE = 'Pokemon TCG demand near all-time highs — Mega Evolution era driving sealed buying, Gen 1 IP (Charizard/Eeveelution) leading, reprints absorbed without price collapse';

// IP Strength Index for a set: max strength among matched anchor characters (data-derived)
function ipStrengthFor(setRec) {
  const anchor = (setRec?.anchor ?? '').toLowerCase();
  const hits = Object.entries(IP_STRENGTH).filter(([k]) => anchor.includes(k.toLowerCase())).map(([, v]) => v);
  return hits.length ? Math.max(...hits) : 50; // default mid when anchor unmatched
}

// Live demand 0-100 from hype keywords + 90d eBay sold volume
function liveDemandScore(signals, ipStrength = 50) {
  if (!signals) return 50;
  const r = receptionTier(signals, ipStrength);
  const recPts = { hot: 90, warm: 68, neutral: 50, mid: 40, negative: 20, unknown: 50 }[r.tier] ?? 50;
  const { n } = ebaySold30(signals);
  const volPts = n >= 20 ? 90 : n >= 8 ? 65 : 40;
  return Math.round(recPts * 0.6 + volPts * 0.4);
}

// One accurate metric: setScore = ipStrength*0.5 + liveDemand*0.3 + pricePerf*0.2
function computeSetScore(setRec, signals, liveMultiple) {
  const ipStrength = ipStrengthFor(setRec);
  const live       = liveDemandScore(signals, ipStrength);
  const peak       = Math.max(setRec?.observedPeakMultiple ?? 0, liveMultiple ?? 0);
  const pricePerf  = Math.min(peak, 4) / 4 * 100;
  const score      = Math.round(ipStrength * 0.5 + live * 0.3 + pricePerf * 0.2);
  return { score, ipStrength, live, pricePerf: Math.round(pricePerf), peak };
}

function tierOf(score) {
  return score >= 91 ? 'S+' : score >= 81 ? 'S' : score >= 71 ? 'A' : score >= 61 ? 'B' : score >= 51 ? 'C' : 'No Send';
}

// ── Set lifecycle stage from release date ─────────────────────────────────────
// Categories: New (pre-release / <1mo) · Current (1-3mo) · Aging (3-6mo) ·
// Maturing (6-12mo) · Reprint Window (12-24mo) · OOP/Final (24mo+)
function setLifecycle(prod) {
  const rd = prod.releaseDate ?? '';
  const upcoming = rd.includes('<t:') || (/drops|pre-?order/i.test(rd) && !/released/i.test(rd));
  if (upcoming) return { stage: 'New', months: 0, line: 'Pre-release — price discovery has not started; pre-order speculation, not a real floor' };
  // Parse "Released March 27, 2026" or "Released Dec 2025"
  let when = null;
  const m = rd.match(/Released\s+([A-Za-z]+)\s+(?:(\d{1,2}),?\s+)?(\d{4})/i);
  if (m) {
    const mon = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .indexOf(m[1].slice(0,3).toLowerCase());
    if (mon >= 0) when = new Date(Date.UTC(+m[3], mon, m[2] ? +m[2] : 1));
  }
  // Fallback to SET_SCORES "released" YYYY-MM
  if (!when) {
    const setKey = Object.keys(SET_SCORES).filter(k => prod.set?.includes(k) || prod.label?.includes(k)).sort((a,b)=>b.length-a.length)[0];
    const ym = SET_SCORES[setKey]?.released;
    if (ym) { const [y, mo] = ym.split('-').map(Number); when = new Date(Date.UTC(y, mo - 1, 1)); }
  }
  if (!when) return { stage: 'Unknown', months: null, line: 'Release date unconfirmed — lifecycle stage not determined' };
  const months = (Date.now() - when.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months < 1)  return { stage: 'New',            months, line: `New — <1mo on market; secondary still in price discovery` };
  if (months < 3)  return { stage: 'Current',        months, line: `Current set — ${months.toFixed(1)}mo old; floor forming, supply still flowing from retail` };
  if (months < 6)  return { stage: 'Aging',          months, line: `Aging — ${months.toFixed(1)}mo old; retail allocation thinning, secondary stabilizing` };
  if (months < 12) return { stage: 'Maturing',       months, line: `Maturing cycle — ${months.toFixed(1)}mo old; supply mostly absorbed, hold thesis strengthens` };
  if (months < 24) return { stage: 'Reprint Window', months, line: `Reprint window — ${months.toFixed(1)}mo old; watch for restock/reprint compression before next leg up` };
  return { stage: 'OOP/Final', months, line: `${(months/12).toFixed(1)}yr old — likely OOP or due final print; OOP appreciation curve begins` };
}

// ── Reception tier from raw social text (hype vs mid vs trash keywords) ────────
function gatherTexts(s) {
  return [
    ...(s.reddit?.posts ?? []), ...(s.discord?.snippets ?? []),
    ...(s.instagram?.posts ?? []), ...(s.facebook?.posts ?? []),
    ...(s.x?.tweets ?? []), ...(s.google?.snippets ?? []),
    ...(s.whatnot?.posts ?? []),
  ].map(t => String(t).toLowerCase());
}
function receptionTier(s, ipStrength = 50) {
  const texts = gatherTexts(s);
  const HYPE = ['amazing','incredible','insane','massive','spectacular','fire','🔥','must have','chase','grail','banger','goated','cracked','heat','stacked','god pack','hits hard','best set'];
  const MID  = ['meh','average','mid','cool','decent','fine','okay','ok ','nothing special','underwhelming','forgettable'];
  const NEG  = ['trash','garbage','hot dookie','dookie','dogwater','dumpster','worst','flop','dead set','skip it','filler set','bulk','overprinted','no chase'];
  let hype = 0, mid = 0, neg = 0;
  for (const t of texts) {
    HYPE.forEach(w => { if (t.includes(w)) hype++; });
    MID.forEach(w  => { if (t.includes(w)) mid++; });
    NEG.forEach(w  => { if (t.includes(w)) neg++; });
  }
  const net = hype - neg;
  // raw keyword tier
  const RANK = { unknown:-1, negative:0, mid:1, neutral:2, warm:3, hot:4 };
  let tier;
  if (!texts.length)             tier = 'unknown';
  else if (neg > hype && neg >= 2) tier = 'negative';
  else if (hype >= 3 && net >= 2)  tier = 'hot';
  else if (mid >= hype && mid >= 2) tier = 'mid';
  else if (net >= 1)               tier = 'warm';
  else                             tier = 'neutral';

  // ── IP-strength blend ────────────────────────────────────────────────────────
  // Thin/quiet chatter under-reads strong-anchor sets. When chatter is NOT strongly
  // negative, floor the tier by the set's IP strength so an S/S+ anchor (Charizard,
  // Eeveelutions) is never labelled "filler" just because a maturing set is quiet.
  const stronglyNegative = neg >= 3 && neg > hype;
  const ipFloor = ipStrength >= 85 ? 'hot' : ipStrength >= 70 ? 'warm' : ipStrength >= 55 ? 'neutral' : null;
  let ipDriven = false;
  if (!stronglyNegative && ipFloor && RANK[ipFloor] > RANK[tier]) { tier = ipFloor; ipDriven = true; }

  const LABEL = {
    unknown:  'Reception unscored — no social chatter captured this run',
    negative: 'Buyers are panning it — chatter skews negative; expect pricing to reflect weak demand',
    mid:      'Lukewarm — buyers treating it as filler, little urgency',
    neutral:  'Neutral — no strong pull or pushback either way',
    warm:     ipDriven ? 'Steady structural demand — proven anchor IP keeps interest durable even in quiet windows'
                       : 'Positive lean — steady buyer interest, no cool-off',
    hot:      ipDriven ? 'Strong structural demand — elite anchor IP carries this set regardless of day-to-day chatter'
                       : 'Strong excitement — buyers are actively chasing this release',
  };
  return { tier, label: LABEL[tier], ipDriven };
}

// ── Volume analysis ───────────────────────────────────────────────────────────
// Gauge = eBay COMPLETED/SOLD listings over the trailing 30-DAY window (real sold
// velocity, dated from the sold-listing scrape) + community mention velocity.
// Thresholds (eBay solds / 30d):  Heavy ≥20  ·  Moderate 8–19  ·  Light <8.
// Falls back to 90d count labeled as such if 30d dating unavailable.
function ebaySold30(s) {
  if (s.ebay?.sold30 != null) return { n: s.ebay.sold30, win: '30d' };
  if (s.ebay?.sold90 != null) return { n: s.ebay.sold90, win: '90d' };
  return { n: s.ebay?.activeCount ?? s.ebay?.count ?? 0, win: 'active' };
}
function volumeTier(s) {
  const { n, win } = ebaySold30(s);                                            // eBay sold velocity (primary)
  const dxTrades = (s.historicalWholesale ?? []).reduce((a, p) => a + (p.market?.tradeCount ?? 0), 0); // DX wholesale trades
  const wn       = s.whatnot?.count ?? 0;                                       // Whatnot live-auction listings
  const social   = (s.discord?.mentions ?? 0) + (s.reddit?.mentions ?? 0);      // community mention velocity
  const tag = win === '30d' ? 'eBay solds (30d)' : win === '90d' ? 'eBay solds (90d)' : 'eBay active';
  // Composite score: eBay sold velocity dominates; DX trades + Whatnot add cross-platform
  // confirmation. DX count feeds the score but is NEVER printed (must stay out of embed).
  const composite = n + dxTrades * 1.5 + wn * 0.5;
  const platforms = `${n} ${tag}, ${wn} Whatnot, ${social} mentions`;
  if (composite >= 25) return `Heavy sales volume — ${platforms}; high cross-platform liquidity, price reliable and well-supported`;
  if (composite >= 10) return `Moderate sales volume — ${platforms}; steady turnover, price holding but not explosive`;
  return `Light sales volume — ${platforms}; thin liquidity, price less reliable / wider spreads`;
}

// ── Print run estimate (Pokemon never officially discloses) ────────────────────
function printRunLine(prod) {
  if (prod.printRun) return `${prod.printRun}`;
  return `Not officially disclosed by TPCi — no verified print-run figure. Community estimates only; track restock cadence as the supply proxy. Source to review: pokebeach.com / r/PKMNTCGDeals reprint threads`;
}

// Static comp score for OTHER sets (no live signals available for them):
// ipStrength*0.625 + pricePerf*0.375 (renormalized 50/30 IP-vs-price weights).
function staticSetScore(setRec) {
  const ip = ipStrengthFor(setRec);
  const pricePerf = Math.min(setRec?.observedPeakMultiple ?? 0, 4) / 4 * 100;
  return Math.round(ip * 0.625 + pricePerf * 0.375);
}

// ── Set vs comparable sets (data-derived score comparison) ────────────────────
function setComparison(prod, signals, liveMultiple) {
  // Skip vintage entries; prefer _dbKey for direct lookup
  const _validEntries = ([k, v]) => v?.scale !== 'vintage';
  const setKey = prod._dbKey && SET_SCORES[prod._dbKey]
    ? prod._dbKey
    : Object.entries(SET_SCORES).filter(_validEntries).map(([k]) => k)
        .filter(k => prod.set?.includes(k) || prod.label?.includes(k))
        .sort((a,b)=>b.length-a.length)[0];
  const me = SET_SCORES[setKey];
  if (!me) return null;
  const sc = computeSetScore(me, signals, liveMultiple);
  const myTier = tierOf(sc.score);
  // Compare only within same category/scale; skip vintage + skip sets whose name appears in current set's name (same-series)
  const others = Object.entries(SET_SCORES)
    .filter(_validEntries)
    .filter(([k]) => k !== setKey && !(prod.set?.includes(k)) && !(prod.label?.includes(k)))
    .map(([k, v]) => { const s = staticSetScore(v); return { k, ...v, score: s, tier: tierOf(s) }; });
  const stronger = others.filter(o => o.score > sc.score).sort((a,b)=>a.score-b.score)[0];
  const weaker   = others.filter(o => o.score < sc.score).sort((a,b)=>b.score-a.score)[0];
  const lbl = o => `${o.k} (${o.tier} Tier, ${o.score}/100)`;
  const lines = [
    `• **Set Score ${sc.score}/100 → ${myTier} Tier**`,
    ...(me.note ? [`• ${me.note}`] : []),
  ];
  if (stronger) lines.push(`• Weaker than ${lbl(stronger)} — ${(stronger.note ?? '').split('.')[0]}`);
  if (weaker)   lines.push(`• Stronger than ${lbl(weaker)}`);
  return { text: lines.join('\n'), score: sc.score, tier: myTier };
}

// ── Advanced sections (Exit Window / Closest Comps / Demand Drivers / Catalysts / Break-Even / Kill Switches) ──
function generateAdvancedSections(prod, signals, market, feedIntel, docsCtx) {
  const s = signals ?? {};
  const retail      = prod.retail ?? null;
  const sold30      = s.ebay?.sold30 ?? null;
  const sold90      = s.ebay?.sold90 ?? null;
  const catLc       = (prod.category ?? '').toLowerCase();
  const lblLc       = (prod.label ?? '').toLowerCase();
  const isOnePiece  = catLc === 'one_piece' || /one.piece|op-?\d{2}/i.test(lblLc);
  const isLorcana   = !isOnePiece && (catLc === 'other_tcg' || /lorcana/i.test(lblLc));
  const isMTG       = catLc === 'mtg' || /magic|secret lair/i.test(lblLc);
  const isTopps     = catLc === 'topps' || /topps|panini/i.test(lblLc);
  const isLEGO      = catLc === 'lego' || /\blego\b/i.test(lblLc);

  const fmt$ = v => v != null ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : 'N/A';

  // ── Break-Even (always computable when retail known) ─────────────────────────
  let breakEven = null;
  if (retail) {
    const salesTax    = 0.10;
    const ebayFee     = 0.13;
    const cost        = retail * (1 + salesTax);
    const minSale     = Math.ceil(cost / (1 - ebayFee));
    const curRoi      = market ? Math.round(((market * (1 - ebayFee) - cost) / cost) * 100) : null;
    const mktLbl      = market ? `Current ${fmt$(market)} → **${curRoi != null ? (curRoi >= 0 ? '+' : '') + curRoi + '% ROI' : 'N/A'}**` : '';
    breakEven = `${fmt$(retail)} MSRP + 10% tax = **${fmt$(cost)} cost basis** → need ≥ **${fmt$(minSale)}** eBay sale to break even (13% fee).${mktLbl ? ' ' + mktLbl + '.' : ''}`;
  } else if (market) {
    breakEven = `No MSRP on file — secondary ${fmt$(market)} is your cost basis if entering at market.`;
  }

  // ── Closest Comps (DB-driven) ─────────────────────────────────────────────────
  let closestComps = null;
  if (isOnePiece && retail) {
    try {
      {
        const db = JSON.parse(readFileSync(join(ROOT, 'set-history-one-piece.json'), 'utf8'));
        const curMult = market ? market / retail : null;
        const NAMES   = { 'one-piece-op01':'OP01 Romance Dawn','one-piece-op02':'OP02 Paramount War',
          'one-piece-op03':'OP03 Pillars','one-piece-op04':'OP04 Kingdoms','one-piece-op05':'OP05 Awakening',
          'one-piece-op06':'OP06 Wings Captain','one-piece-op07':'OP07 500 Years','one-piece-op08':'OP08 Two Legends',
          'one-piece-op09':'OP09 Four Emperors','one-piece-op10':'OP10 Royal Blood','one-piece-op11':'OP11 Emperors New World',
          'one-piece-op12':'OP12 Wings Pirates','one-piece-op13':'OP13 Carrying On His Will' };
        const thisKey = prod._dbKey ?? '';
        const scored  = Object.entries(db.sets)
          .filter(([k]) => k !== thisKey)
          .map(([k, set]) => {
            const box     = set.products?.['booster-box'];
            if (!box?.ath || !set.retail) return null;
            const athM    = +(box.ath / set.retail).toFixed(1);
            const curM    = box.current ? +(box.current / set.retail).toFixed(1) : null;
            return { key: k, name: NAMES[k] ?? k, athM, curM, ath: box.ath, cur: box.current, retail: set.retail };
          })
          .filter(Boolean)
          .sort((a, b) => {
            const da = curMult ? Math.abs(a.athM - (market / retail)) : 0;
            const db2 = curMult ? Math.abs(b.athM - (market / retail)) : 0;
            return da - db2;
          })
          .slice(0, 3);
        if (scored.length) {
          closestComps = scored.map(c =>
            `• **${c.name}** — ${fmt$(c.retail)} retail → ${fmt$(c.ath)} ATH (${c.athM}×)${c.cur ? ` → now ${fmt$(c.cur)} (${c.curM}×)` : ''}`
          ).join('\n');
        }
      }
    } catch {}
  }
  // Fallback authored comps
  if (!closestComps && prod.writeup?.priceComp) {
    closestComps = prod.writeup.priceComp.slice(0, 600);
  }

  // ── Exit Window ───────────────────────────────────────────────────────────────
  let exitWindow = prod.writeup?.exitWindow ?? null;
  if (!exitWindow) {
    if (isOnePiece && retail) {
      const months = prod._months ?? (prod.releaseDate ? Math.round((Date.now() - new Date(prod.releaseDate)) / (1000*60*60*24*30.44)) : null);
      if (months != null) {
        if (months < 3)
          exitWindow = `**Now–60 days:** primary flip window — OP sets peak 45-75 days post-release. **Month 3-6:** Bandai reprint wave risk → plan exit before announcement; sell into strength. **Post-reprint:** if price holds >2×, sustained IP demand — long hold valid.`;
        else if (months < 6)
          exitWindow = `**Reprint window active (month ${months}).** Exit now to lock gains OR hold through the dip if IP is S-tier (expect -30 to -50% on reprint wave). **6-18 months:** if absorbed above 2×, long-hold thesis valid.`;
        else if (months < 12)
          exitWindow = `**Post-reprint (${months} months old).** Secondary is at real demand floor. **Hold thesis:** S-tier sets sustain 2-4× indefinitely; weaker sets bleed to 1.0-1.2×. Watch for next Bandai set release pulling demand away.`;
        else
          exitWindow = `**Mature secondary (${months}mo).** Price is a real demand floor. Appreciation now driven by IP permanence only — not supply dynamics. Exit when market > 0.85× ATH (near-top signal).`;
      }
    } else if (isLorcana) {
      exitWindow = `**Now–30 days:** flip window only. Ravensburger reprints every chapter within 6 months — secondary premium fades on restock. No hold thesis; sell before reprint announcement.`;
    } else if (isMTG) {
      exitWindow = `**Now–72h (SL foils):** Secret Lair foil premium peaks at drop, bleeds 30-70% within days. CB boxes: **Week 1** = best exit unless set has Commander staples driving sustained demand. **6-12 months:** only S-tier crossover IP sustains appreciation.`;
    } else if (isTopps) {
      exitWindow = `**Day 1–Week 2:** Hobby box release-week premium is the flip window. Post-National (late July) = premium fades as supply fills in. RC class revealed through breaks = primary price catalyst; exit if weak rookie class emerges.`;
    } else if (isLEGO) {
      const eol = prod.eolDate ?? 'TBD';
      exitWindow = `**Pre-EOL (now → ${eol}):** active sets sell at/below retail — no flip margin. **Post-EOL:** appreciation starts 3-6 months after retirement. Target 3-7% CAGR over 2-4 years. Strong licensed IP = faster appreciation; STEM/educational themes = slower.`;
    } else if (retail && market) {
      const mult = (market / retail).toFixed(1);
      exitWindow = `**Now:** ${fmt$(market)} (${mult}× retail) — current opportunity. Monitor for restock signals (OOS = upside sustained; back-in-stock = exit immediately).`;
    }
  }

  // ── Demand Drivers ────────────────────────────────────────────────────────────
  let demandDrivers = prod.writeup?.demandDrivers ?? null;
  if (!demandDrivers) {
    const lines = [];
    // Structural: baseline sealed collector demand
    const vol90  = sold90 ?? 0;
    const vol30  = sold30 ?? 0;
    const specRatio = (vol90 > 0) ? ((vol30 / (vol90 / 3)).toFixed(1)) : null;
    const structural = vol90 > 0 ? `${Math.round(vol90 / 3)} units/month baseline collector demand` : 'collector demand unconfirmed';
    // Speculative
    const specLabel = specRatio && specRatio > 1.5 ? `**accelerating** (${specRatio}× baseline rate — speculators accumulating)`
      : specRatio && specRatio < 0.7 ? `**cooling** (${specRatio}× baseline rate — flipper exits)`
      : vol30 ? `stable (${vol30} sold/30d)` : 'velocity unconfirmed';
    // IP driver
    const ipDriver = prod.writeup?.product?.match(/\*\*([^*]+(?:Luffy|Shanks|Roger|Kaido|Zoro|Ace|Charizard|Pikachu|Eevee|Mew|Zard)[^*]*)\*\*/i)?.[1]
      ?? (isOnePiece ? 'Luffy/Roger IP pull' : 'IP demand');
    lines.push(`• **Structural:** ${structural}`);
    lines.push(`• **Speculative:** Flipper demand ${specLabel}`);
    lines.push(`• **IP Pull:** ${ipDriver} — crossover collector + competitive player demand`);
    // Inject live checkout feed intel — confirms real bot/human copping activity
    if (feedIntel?.totalCheckouts > 0) {
      const prodLbl = (prod.label ?? '').toLowerCase();
      // A future-dated pre-order CANNOT have real checkouts — never inject them.
      const _futCk = (() => { const d = Date.parse(prod.releaseDate ?? ''); return Number.isFinite(d) && d > Date.now(); })();
      // Require ≥2 distinctive keyword hits (single generic word like "collection" false-matches).
      const _stop = new Set(['piece','game','card','premium','collection','booster','english','sealed','edition']);
      const matchingCheckouts = _futCk ? [] : feedIntel.checkouts.filter(c => {
        const cl = c.product.toLowerCase();
        const keyWords = prodLbl.split(/\s+/).filter(w => w.length > 4 && !_stop.has(w));
        return keyWords.filter(w => cl.includes(w)).length >= 2;
      });
      if (matchingCheckouts.length > 0) {
        lines.push(`• **Live Checkout Activity:** **${matchingCheckouts.length} confirmed checkouts** via 🤖checkout-feed in past 24h — active bot/manual copping confirms real demand`);
      }
      // No match → DROP. Never inject an unrelated product's checkout velocity as a demand driver.
    }
    if (lines.length) demandDrivers = lines.join('\n');
  }

  // ── Catalysts ─────────────────────────────────────────────────────────────────
  let catalysts = prod.writeup?.catalysts ?? null;
  if (!catalysts) {
    const lines = [];
    if (isOnePiece && prod.releaseDate) {
      const rel = new Date(prod.releaseDate);
      const reprintWin = new Date(rel); reprintWin.setMonth(reprintWin.getMonth() + 4);
      const reprintWinMax = new Date(rel); reprintWinMax.setMonth(reprintWinMax.getMonth() + 6);
      const fmt = d => d.toISOString().slice(0,7);
      lines.push(`• **Bandai reprint wave:** ${fmt(reprintWin)}–${fmt(reprintWinMax)} — watch for Bandai announcement; exit before confirmed`);
      lines.push(`• **Next OP set release:** pulls demand away from current set (historical: -15-25% on secondary)`);
      lines.push(`• **Tournament season:** if top cards are competitive-legal, FNM/regionals = sustained rip demand`);
    } else if (isLorcana) {
      lines.push(`• **Reprint window:** Ravensburger prints to demand within 6 months of release`);
      lines.push(`• **New chapter release:** demand shifts to new content on announcement`);
    } else if (isMTG) {
      lines.push(`• **WotC reprint announcement:** any chase card reprinted in another product = price collapse`);
      lines.push(`• **Commander ban list update:** removes or adds format staples → secondary reprices within 24h`);
    } else if (isTopps) {
      lines.push(`• **The National (late July):** short-term demand support; pre-National pop fades within weeks`);
      lines.push(`• **RC class breaks:** first hobby breaks reveal RC quality → primary price catalyst`);
    } else if (isLEGO && prod.eolDate) {
      lines.push(`• **EOL: ${prod.eolDate}** — retirement is the single biggest price driver; appreciation starts 3-6mo post-retirement`);
    } else if (retail && market) {
      lines.push(`• **Restock events:** any retailer back-in-stock at MSRP = immediate exit signal`);
      lines.push(`• **Hype cycles:** social media peaks precede price peaks by 1-2 weeks (Peterson/MarketPsych rule)`);
    }
    // Add docs-sourced category rule note if relevant section found
    if (docsCtx?.categorySection) {
      // Extract any deadline/date/catalyst mentioned in category section
      const dateMatch = docsCtx.categorySection.match(/\*\*([^*]{5,60}(?:window|deadline|wave|reprint|EOL|tournament|release)[^*]{0,40})\*\*/i);
      if (dateMatch) lines.push(`• **Docs rule:** ${dateMatch[1].trim()}`);
    }
    if (lines.length) catalysts = lines.join('\n');
  }

  // ── Kill Switches ─────────────────────────────────────────────────────────────
  let killSwitches = prod.writeup?.killSwitches ?? null;
  if (!killSwitches) {
    const lines = [];
    if (isOnePiece) {
      lines.push(`• **Bandai Wave 2 restock announced** → exit within 24-48h. Secondary typically drops -30-50% to 1.5-2× retail on restock confirmation`);
      lines.push(`• **Secondary < 2× retail** → thesis invalidated (structural demand floor not holding); close position`);
      lines.push(`• **Next OP set release with S-tier IP** → demand migrates; begin reducing exposure`);
    } else if (isLorcana) {
      lines.push(`• **Ravensburger reprint confirmed** → exit immediately. Lorcana has zero structural scarcity floor post-reprint`);
      lines.push(`• **Secondary < 1.2× retail** → margin killed by fees; close position`);
    } else if (isMTG) {
      lines.push(`• **WotC announces reprint in ANY product** → exit immediately; MTG reprints fully collapse chase card value`);
      lines.push(`• **Commander ban** on key staple in the set → demand crater; no secondary recovery`);
    } else if (isTopps) {
      lines.push(`• **Weak rookie class confirmed in early breaks** → no hold premium; dump sealed within 48h of break intel`);
      lines.push(`• **Retail secondary drops below MSRP** → demand absorbed, arbitrage dead; close position`);
    } else if (isLEGO) {
      lines.push(`• **Retailer clearance below MSRP** → supply still clearing, not retiring; wait for confirmed EOL`);
      lines.push(`• **WalMart/Target heavy markdown** → print run larger than anticipated; downgrade appreciation thesis`);
    } else {
      if (retail && market) {
        lines.push(`• **Back in stock at retail ${fmt$(retail)}** → exit immediately; secondary premium collapses`);
      }
      lines.push(`• **IP negative catalyst** (recall, controversy, brand damage) → reassess thesis`);
    }
    if (lines.length) killSwitches = lines.join('\n');
  }

  // ── Scenarios (separate from Product Analysis) ────────────────────────────────
  let scenarios = null;
  if (prod.scenarios) {
    if (Array.isArray(prod.scenarios)) {
      scenarios = prod.scenarios.map(s => `**${s.label} (${s.prob}%):** ${s.text}`).join('\n');
    } else {
      scenarios = prod.scenarios;
    }
  } else if (retail && market) {
    const mult  = market / retail;
    const bear  = retail;
    const base  = Math.round(market);
    const bull  = Math.round(market * (mult >= 2 ? 1.3 : 1.4));
    const pw    = Math.round(bear * 0.25 + base * 0.55 + bull * 0.20);
    const roiPW = Math.round(((pw * 0.87 - retail * 1.1) / (retail * 1.1)) * 100);
    scenarios = `**Bear** (restock / demand fades): **${fmt$(bear)}** (≈MSRP).\n**Base** (secondary holds): **${fmt$(base)}** (${mult.toFixed(1)}×).\n**Bull** (OOS extends / demand accelerates): **${fmt$(bull)}** (${(bull/retail).toFixed(1)}×).\nProb-weighted ≈ **${fmt$(pw)}** → **${roiPW >= 0 ? '+' : ''}${roiPW}% ROI**.`;
  }

  return { exitWindow, closestComps, demandDrivers, catalysts, breakEven, killSwitches, scenarios };
}

function generateWriteup(prod, signals, market, roi, t30Market, t30Roi, computedRating, netProfit, feedIntel, docsCtx) {
  const s = signals ?? {};
  // Category gate — Set Analysis + Pokemon MARKET_PULSE machinery apply to POKEMON ONLY.
  // Explicit prod.category wins; legacy entries fall back to set/label heuristic so
  // Pokemon sets without a literal "pokemon" in the title (e.g. Destined Rivals) still match.
  const isPokemon = prod.category
    ? prod.category === 'pokemon'
    : (prod.set?.toLowerCase().includes('mega evolution') || prod.set?.toLowerCase().includes('sv') ||
       /pokemon|pokémon/i.test(prod.label ?? '') || /pokemon|pokémon/i.test(prod.set ?? '') ||
       !!SET_INTEL[Object.keys(SET_INTEL).filter(k => prod.set?.includes(k) || prod.label?.includes(k)).sort((a,b)=>b.length-a.length)[0] ?? '']);

  // ── Derived sentiment quality ─────────────────────────────────────────────────
  const totalSentiment = (s.reddit?.sentiment ?? 0) * 1.5 + (s.x?.sentiment ?? 0) +
    (s.discord?.sentiment ?? 0) * 1.5 + (s.instagram?.sentiment ?? 0) +
    (s.facebook?.sentiment ?? 0) + (s.google?.sentiment ?? 0) + (s.whatnot?.sentiment ?? 0) * 1.5;
  const sentimentCooling = totalSentiment < 5;
  const ebayMedian = s.ebay?.median ?? null;
  // Compute trend: eBay median vs weighted market price (positive = eBay running above market avg = rising)
  const ebayTrend = (ebayMedian && market) ? (ebayMedian - market) / market : null;
  const priceTrendLabel = ebayTrend !== null
    ? (ebayTrend > 0.05 ? 'rising' : ebayTrend < -0.05 ? 'falling' : 'stable')
    : null;
  const multiple = (market && prod.retail) ? (market / prod.retail).toFixed(1) : null;

  const isSVEra    = prod.set?.toLowerCase().includes('sv');
  const isUpcoming = prod.releaseDate?.includes('<t:') || (prod.releaseDate?.toLowerCase().includes('drops') && !prod.releaseDate?.toLowerCase().includes('released'));
  const hasReprintNote = prod.writeup?.market?.toLowerCase().includes('reprint') || prod.releaseDate?.toLowerCase().includes('reprint');

  // ── Resolve set intel ─────────────────────────────────────────────────────────
  const setKey  = Object.keys(SET_INTEL).filter(k => prod.set?.includes(k) || prod.label?.includes(k)).sort((a,b)=>b.length-a.length)[0];
  const setInfo = SET_INTEL[setKey] ?? null;
  // Pokemon-only sealed-format hierarchy (Display>ETB>Bundle>Blister). Gated to avoid
  // substring false-positives like "baskETBall" tagging a Topps box as an ETB.
  const pTyp    = isPokemon ? productTypeTier(prod.label) : null;

  // ── SV-era ETB comp table (fallback when no set-specific intel) ───────────────
  const SV_COMPS = 'Obsidian Flames peaked $106 | Paradox Rift $90 | Paldean Fates $80 | Prismatic Evolutions $49 retail → $150+ sustained';

  // ── Live trajectory from signals (never stale) ────────────────────────────────
  const _er = effectiveRetail ?? 0;  // use detected retail for in-stock bounds
  const retailInStock  = (s.target?.inStock && _er > 0) ||
    (s.walmart?.inStock && s.walmart?.price && _er > 0 && s.walmart.price >= _er * 0.8 && s.walmart.price <= _er * 1.05) ||
    (s.amazon?.inStock  && s.amazon?.price  && _er > 0 && s.amazon.price  >= _er * 0.8 && s.amazon.price  <= _er * 1.05);
  const walmartPrice   = s.walmart?.price ?? null;
  const amazonPrice    = s.amazon?.price ?? null;
  const hwAvgSignal    = signals?.historicalWholesale?.find(p => p.market?.avgTrade && p.market.avgTrade < (prod.retail ?? 999) * 5)?.market?.avgTrade ?? null;
  const wholesaleFloor = hwAvgSignal ? `wholesale avg $${hwAvgSignal.toFixed(0)}` : null;

  // Retail availability line
  const retailLine = retailInStock
    ? `Still on shelves — retail supply compressing secondary; premium won't form until shelves clear`
    : `OOS at retail — secondary is the only source. Allocations fully absorbed`;

  // Secondary price momentum line
  // isEstablished: product has a release date that's clearly in the past (not upcoming, not a discord timestamp)
  const isEstablished = !isUpcoming && prod.releaseDate && !prod.releaseDate.includes('<t:');
  const momentumLine = priceTrendLabel === 'rising'  ? `Secondary moving up — floor is in, buyers paying more. Buy window is narrowing`
    : priceTrendLabel === 'falling' ? `Secondary drifting down — confirm floor before adding units. Don't catch a falling knife`
    : priceTrendLabel === 'stable'  ? `Secondary is stable — floor established at ${fmt$(ebayMedian ?? market ?? 0)}. Upside comes as remaining supply absorbs`
    : isUpcoming ? `Pre-release pricing forming — wait for Day 1 secondary to find the real floor, not pre-order speculation`
    : isEstablished ? `Secondary mature — product has been on market long enough for price discovery to be complete; current ${fmt$(market ?? 0)} reflects real demand floor`
    : `Secondary price forming — no eBay trend data yet; re-run after first sales data appears`;

  // Market multiple context
  const multipleContext = multiple
    ? `${multiple}× retail${multiple >= 3 ? ' — scarcity premium holding strong' : multiple >= 1.5 ? ' — healthy margin above cost' : ' — margin compressing; watch retail availability'}`
    : null;

  // ── Market Analysis ────────────────────────────────────────────────────────────
  // Structure: Reception · Lifecycle · Volume · Secondary (ONE aggregated line) · Print Run
  const mkt = [];
  // Set's anchor IP + strength — blends into reception so strong-IP sets aren't mislabelled in quiet windows
  const scoreRec  = SET_SCORES[Object.keys(SET_SCORES).filter(k => prod.set?.includes(k) || prod.label?.includes(k)).sort((a,b)=>b.length-a.length)[0] ?? ''];
  const ipStr     = ipStrengthFor(scoreRec ?? {});
  const reception = receptionTier(s, ipStr);
  const lifecycle = setLifecycle(prod);

  // 1) Overall Pokemon TCG market + how THIS named set fits — generated PER-RUN from
  //    this product's live signals (no static macro string). Volume → sentiment → trend.
  const fit = reception.tier === 'negative' ? 'lagging the market' : reception.tier === 'hot' ? 'riding the wave' : 'tracking in line';
  const _pulseSent = (s.reddit?.sentiment ?? 0) * 1.5 + (s.x?.sentiment ?? 0) + (s.discord?.sentiment ?? 0) * 1.5 + (s.instagram?.sentiment ?? 0) + (s.facebook?.sentiment ?? 0);
  const _pulseVol  = s.ebay?.sold30 ?? s.ebay?.sold90 ?? null;
  const _demandWord =
    reception.tier === 'hot'      ? 'demand running hot' :
    reception.tier === 'warm'     ? 'demand steady-to-rising' :
    reception.tier === 'negative' ? 'demand soft — buyers skeptical' :
    reception.tier === 'mid'      ? 'demand cooling off' : 'demand quiet';
  const _trendWord =
    priceTrendLabel === 'rising'  ? 'secondary ticking up' :
    priceTrendLabel === 'falling' ? 'secondary sliding' :
    priceTrendLabel === 'stable'  ? 'secondary holding its floor' : 'no secondary trend yet';
  const _volWord = _pulseVol != null ? `${_pulseVol} sold/30d` : 'thin sold volume';
  const _sentDir = _pulseSent > 1 ? 'positive' : _pulseSent < -1 ? 'negative' : 'mixed';
  mkt.push(`• Pokemon sealed: ${_demandWord}, ${_trendWord} (${_volWord}, ${_sentDir} sentiment). ${prod.set} — ${lifecycle.stage} stage, ${fit}.`);

  // 2) Reception — WHAT/WHY buyers feel + the chase driver (no raw counts)
  const chaseCard = dbChaseCards[0]?.name ?? scoreRec?.anchor ?? setInfo?.ip?.match(/Mega [A-Z][a-z]+(?: [A-Z][a-z]+)? ex|Charizard|Eevee/)?.[0] ?? null;
  mkt.push(`• ${reception.label}${chaseCard ? ` — buyers drawn to ${chaseCard}` : ''}`);

  // 2b) Live chase card data from local tcgcsv DB — actual singles prices driving sealed demand
  if (dbChaseCards.length) {
    const chaseStr = dbChaseCards.map(c => `${c.name} $${c.market.toFixed(0)}${c.rarity ? ` (${c.rarity})` : ''}`).join(' · ');
    mkt.push(`• **Chase singles (live DB):** ${chaseStr}`);
  }

  // 3) Lifecycle stage
  mkt.push(`• ${lifecycle.line}`);

  // 4) Volume analysis (eBay completed/sold = trailing 90-day window)
  mkt.push(`• ${volumeTier(s)}`);

  // 5) Retail-on-shelves ONLY when actually sitting at retail price (Journey Together case)
  if (retailInStock) {
    mkt.push(`• Still on shelves at retail — supply suppressing secondary; premium won't form until shelves clear`);
  }

  // 6) JP leading indicator (Pokemon only — JP sets release 3-6mo before EN, secondary = forward demand signal)
  if (jpLeadSignal && jpLeadSignal.setName) {
    const _jpMkt = jpLeadSignal.market ? `JP secondary $${jpLeadSignal.market.toFixed(0)}` : 'JP secondary n/a';
    const _jpRet = jpLeadSignal.retail && jpLeadSignal.mult ? ` (${jpLeadSignal.mult.toFixed(1)}× JP retail)` : '';
    const _jpChase = jpLeadSignal.topChase ? ` Chase: ${jpLeadSignal.topChase}.` : '';
    const _jpAdvice = jpLeadSignal.signal === 'STRONG 🟢'
      ? 'JP outperforming retail 3-6mo before EN release → strong EN sealed demand expected.'
      : jpLeadSignal.signal === 'MODERATE 🟡'
      ? 'JP holding modest premium → EN demand likely neutral-to-positive.'
      : 'JP at/below retail → EN demand likely soft; watch for supply overhang.';
    mkt.push(`• **JP Precursor [${jpLeadSignal.setName}]:** ${_jpMkt}${_jpRet}. ${jpLeadSignal.signal}.${_jpChase} ${_jpAdvice}`);
  }

  let market_ = mkt.filter(Boolean).join('\n') || prod.writeup?.market || '• Insufficient signal data — re-run pipeline';
  if (market_.length > 1020) market_ = market_.slice(0, 1017) + '...';

  // ── Set Analysis (renders ABOVE Product Analysis) ─────────────────────────────
  // Set-level: comparison score · TOP chase card (2nd bullet) · chase IP · why good/bad set · set demand
  const setA = [];
  const comp = isPokemon ? setComparison(prod, signals, multiple ? +multiple : null) : null;
  if (comp) setA.push(comp.text);
  // 2nd bullet: top chase card from DB (TCG + sports) — primary demand anchor
  if (dbChaseCards.length) {
    const top = dbChaseCards[0];
    setA.push(`• Top Chase: **${top.name}** $${top.market?.toFixed(0) ?? '?'}${top.rarity ? ` (${top.rarity})` : ''}`);
  }
  if (setInfo?.ip) {
    const ipDedup = setInfo.ip.split('|').map(seg => {
      const m = seg.match(/^([^:]+:\s*)?(.*)$/s);
      const prefix = m[1] ?? '';
      const items = [...new Set(m[2].split(',').map(x => x.trim()).filter(Boolean))];
      return prefix + items.join(', ');
    }).join(' | ');
    setA.push(`• Chase IP: ${ipDedup}`);
  }
  if (setInfo?.sentiment) setA.push(`• Demand: ${sentimentCooling ? setInfo.sentiment.toLowerCase().replace(/^[^—]+—\s*/,'') : setInfo.sentiment}`);
  if (setInfo?.narrative) setA.push(`• ${setInfo.narrative}`);
  let setAnalysis_ = setA.filter(Boolean).join('\n') || '• Set not yet scored — add to set-scores.json';
  if (setAnalysis_.length > 1020) setAnalysis_ = setAnalysis_.slice(0, 1017) + '...';

  // ── Product Analysis ──────────────────────────────────────────────────────────
  // Product FORMAT only: appreciation tier + exact format spec. No contents dump,
  // no retail-stock numbers, no cross-product comparisons (those are Set Analysis).
  const prd = [];
  if (pTyp) prd.push(pTyp.line);
  // (no auto "• Format:" line — the authored product writeup carries config; contents is redundant)
  // Carry product-specific bullets EXCEPT banned junk (stock counts, contents ranges, cross-product comps)
  const productWriteup = prod.writeup?.product;
  const productIsStub = !productWriteup || /pending|TBD/i.test(productWriteup);
  if (!productIsStub) {
    productWriteup.split('\n')
      .filter(l => l.trim())
      .filter(l => !/\d[\d,]*\+?\s*(target|walmart|units|stock)/i.test(l))
      .filter(l => !/no differentiating|vs\.?\s+\w+\s+bb|booster packs?(,| —)/i.test(l))
      .filter(l => !prd.some(e => e.trim() === l.trim()))
      .forEach(l => prd.push(l));
  } else if (productIsStub) {
    // Auto-fill: config + Bear/Base/Bull from live signals + category mechanics
    const rStub = prod.retail
      ?? (s.target?.inStock  && s.target?.price  ? s.target.price  : null)
      ?? (s.walmart?.inStock && s.walmart?.price && s.walmart.price < (ebayMedian ?? 9999) * 0.9 ? s.walmart.price : null)
      ?? (s.amazon?.inStock  && s.amazon?.price  && s.amazon.price  < (ebayMedian ?? 9999) * 0.9 ? s.amazon.price  : null)
      ?? null;
    const mStub  = market ?? ebayMedian ?? null;
    const multN  = (rStub && mStub) ? +(mStub / rStub).toFixed(1) : null;

    const configParts = [(prod.label ?? prod.set ?? 'Unknown').replace(/\b(\w)/g, c => c.toUpperCase())];
    if (rStub)  configParts.push(`$${rStub} MSRP`);
    const _futP = (() => { const d = Date.parse(prod.releaseDate ?? ''); return Number.isFinite(d) && d > Date.now(); })();
    if (prod.preRelease && _futP) configParts.push(`PRE-ORDER, ships ${prod.releaseDate}`);
    else if (retailInStock) configParts.push('in stock at retail'); else configParts.push('OOS at retail');
    prd.push(`• **Config:** ${configParts.join(' · ')}.`);

    // WHAT'S IN IT + WHY buy/not comes from the AUTHORED writeup.product (researched per SKU)
    // or scraped contents — never a category-hardcoded prose template. If absent, the stub stays
    // factual (config + scenarios) and flags that contents research is required.
    if (!productWriteup) {
      prd.push(`• **Contents/why: RESEARCH REQUIRED** — populate writeup.product with THIS SKU's actual contents (chase cards, what's inside) + why buy/not. No generic template.`);
    }

    if (signals?.youtube?.titles?.length) {
      prd.push(`• YouTube: ${signals.youtube.titles.length} break/review videos found — market awareness confirmed.`);
    }

    if (rStub && mStub) {
      const bear = rStub;
      const base = Math.round(mStub);
      const bull = Math.round(mStub * (multN && multN >= 2 ? 1.3 : 1.4));
      const pw   = Math.round(bear * 0.25 + base * 0.55 + bull * 0.20);
      const bearLabel = retailInStock ? 'retail restocks / weak demand' : 'demand fades to retail floor';
      prd.push(`**Bear** (${bearLabel}): **~$${bear}** (≈MSRP).`);
      prd.push(`**Base** (secondary holds): **~$${base}**${multN ? ` (${multN}×)` : ''}.`);
      prd.push(`**Bull** (OOS extends / demand accelerates): **~$${bull}**.`);
      prd.push(`Prob-weighted ≈ **$${pw}**.`);
    } else if (rStub) {
      prd.push(`**Bear:** ~$${rStub} (≈MSRP). **Base/Bull:** pending Day 1 secondary data — re-run after release.`);
    } else {
      prd.push(`Bear/Base/Bull: pending retail price confirmation + Day 1 secondary data.`);
    }
  }
  let product_ = prd.filter(Boolean).join('\n') || '• Product detail pending';
  if (product_.length > 1020) product_ = product_.slice(0, 1017) + '...';

  // Non-Pokemon: drop the Pokemon market pulse + Set Analysis entirely.
  // Use the authored analyst synthesis (writeup.market) + category-neutral live lines.
  if (!isPokemon) {
    // Claude CLI synthesis takes priority when corrections were provided
    if (prod._claudeMarket) {
      market_ = prod._claudeMarket;
      if (market_.length > 1020) market_ = market_.slice(0, 1017) + '...';
      setAnalysis_ = null;
      return { market: market_, setAnalysis: null, setTier: null, product: product_ };
    }
    const authoredMarket = prod.writeup?.market;
    const isStub = !authoredMarket || /pending|TBD/i.test(authoredMarket);
    if (isStub) {
      // Category-aware Thesis/Liquidity/Risk auto-synthesis from live signals
      const autoMkt = [];
      const catLc  = (prod.category ?? '').toLowerCase();
      const lblLc  = (prod.label ?? '').toLowerCase();
      // Projection mode: an unreleased SKU has NO own comps — every eBay number here is a
      // PRIOR-VERSION match, never this product's. Must be labeled as such, never as its own.
      const _isProjection = prod.preRelease && (() => { const d = Date.parse(prod.releaseDate ?? ''); return Number.isFinite(d) && d > Date.now(); })();

      // Resolve retail: prefer authored, fallback to in-stock retail signals
      const retailPrice = prod.retail
        ?? (s.target?.inStock  && s.target?.price  ? s.target.price  : null)
        ?? (s.walmart?.inStock && s.walmart?.price && s.walmart.price < (market ?? 9999) * 0.9 ? s.walmart.price : null)
        ?? (s.amazon?.inStock  && s.amazon?.price  && s.amazon.price  < (market ?? 9999) * 0.9 ? s.amazon.price  : null)
        ?? null;

      const mktPrice   = prod._userMarket ?? market ?? ebayMedian ?? null;
      const mult       = (retailPrice && mktPrice) ? (mktPrice / retailPrice).toFixed(1) : null;
      const r$         = retailPrice ? `$${retailPrice}` : null;
      const m$         = mktPrice    ? `$${mktPrice.toFixed(0)}` : null;
      const sold30     = signals?.ebay?.sold30 ?? null;
      const sold90     = signals?.ebay?.sold90 ?? null;
      const sentVal    = s.reddit?.sentiment ?? s.discord?.sentiment ?? s.twitter?.sentiment ?? 0;
      const mentions   = (s.reddit?.mentions ?? 0) + (s.discord?.mentions ?? 0) + (s.twitter?.mentions ?? 0);
      const sentLabel  = sentVal > 0 ? 'positive' : sentVal < 0 ? 'negative' : 'mixed';

      // ── Category mechanics (the "why") ──────────────────────────────────────────
      const isOnePiece   = catLc === 'one_piece' || /one.piece|op-?\d{2}/i.test(lblLc);
      const isLorcana    = !isOnePiece && (catLc === 'other_tcg' || /lorcana|disney lorcana/i.test(lblLc));
      const isMTG        = catLc === 'mtg'  || /magic.*gathering|secret lair|mtg\b/i.test(lblLc);
      const isTopps      = catLc === 'topps' || /topps|panini/i.test(lblLc);
      const isLEGO       = catLc === 'lego'  || /\blego\b/i.test(lblLc);
      const isBlister    = /blister pack|blister/i.test(lblLc);
      const isBoosterBox = /booster box|display box|booster display/i.test(lblLc);
      const isHobbyBox   = /hobby box|hobby/i.test(lblLc);
      const isBlasterBox = /blaster box|blaster/i.test(lblLc);
      // Handbook product ranges (type drives contents + sentiment, per category):
      const isGiftSet    = /gift set|gift box/i.test(lblLc);
      const isTrove      = /trove|illumineer/i.test(lblLc);
      const isStarter    = /starter (set|deck)|collection starter/i.test(lblLc);
      const isCollBooster= /collector booster/i.test(lblLc);

      let mechanic   = '';
      let holdRisk   = '';
      let ceilingNote = '';
      // Live anchors — never bake MSRP/multiples into prose; pull from this product's data.
      const msrpC = r$ ? `${r$} MSRP` : 'MSRP pending verification';
      const multC = (mult && m$) ? `currently ${m$} (${mult}× retail)` : (m$ ? `currently ${m$}` : 'no secondary print yet');

      if (isLorcana) {
        if (isBlister) {
          mechanic    = `Lorcana blister (${msrpC}) — low-retail OOS flip play only; ${multC}. Singles hunt drives blister demand when box supply dries up.`;
          holdRisk    = `Ravensburger reprints every Lorcana chapter within ~6 months — structural ceiling on all Lorcana sealed. No hold thesis on blisters.`;
          ceilingNote = ``;
        } else if (isBoosterBox) {
          mechanic    = `Lorcana booster box (${msrpC}); ${multC}. Ravensburger reprints each chapter — primary play is flip within 30-60 days of release, not a hold.`;
          holdRisk    = `Reprint mechanic is structural — every prior chapter reprinted within ~6 months. Hold thesis only with a confirmed print cap; compare against this set's prior-chapter post-reprint floor in the DB.`;
          ceilingNote = ``;
        } else if (isTrove || isGiftSet || isStarter) {
          const kind = isTrove ? 'Illumineer\'s Trove' : isGiftSet ? 'Gift Set/Box' : 'Collection Starter Set';
          mechanic    = `Lorcana ${kind} (${msrpC}); ${multC}. Confirm THIS product's exclusive contents — troves/gift sets often carry chase cards or accessories NOT in a display box or blister; value tracks those exclusives, not generic box odds.`;
          holdRisk    = `Ravensburger reprints chapters within ~6 months; only product-exclusive cards (verify the contents list) hold a premium past reprint. No exclusive = no hold.`;
        } else {
          mechanic    = `Lorcana sealed (${msrpC}); ${multC}. Ravensburger prints to demand — no scarcity unless confirmed OOP. Identify the exact product (box/pack/gift/trove) — contents differ.`;
          holdRisk    = `Reprint risk is structural across all Lorcana products.`;
        }
      } else if (isTopps) {
        // Sports comp rule: same-year sibling products first (e.g. 2026 Chrome → 2026 Prizm/Cosmic),
        // else prior year. Two drivers: (1) checklist → print-run estimate, (2) player/rookie class quality.
        const sportsNote = `Comp same-year siblings (e.g. Prizm/Cosmic of this sport/year) first, else prior year; rate the rookie/player class (exciting & good = bid, lukewarm = pass) and read the checklist for print-run.`;
        if (isHobbyBox) {
          mechanic    = `Topps Hobby (${msrpC}) — fixed print run, no reprint; ${multC}. Appreciation gated on the rookie class. ${sportsNote}`;
          holdRisk    = `Rookie class is the primary driver — weak/unknown class = no hold premium. Thin presale depth signals demand risk.`;
        } else if (isBlasterBox) {
          mechanic    = `Topps Blaster/Retail (${msrpC}) — Target/Walmart continuous restock; ${multC}. Flip only on an OOS spike, never a hold. ${sportsNote}`;
          holdRisk    = `Restock risk perpetually kills the secondary premium. Buy in bulk only when confirmed OOS.`;
        } else {
          mechanic    = `Topps sealed (${msrpC}); ${multC}. Format sets the rule: hobby = fixed print (class-gated appreciation), retail = reprint/restock (flip-only). ${sportsNote}`;
          holdRisk    = `Retail formats reprice to MSRP on restock. Hobby appreciates only with a strong class.`;
        }
      } else if (isMTG) {
        const isSL        = /secret lair/i.test(lblLc);
        const isGiftBundle= /gift bundle|bundle/i.test(lblLc);
        const isPlayBox   = /play box|play booster/i.test(lblLc);
        // MTG value drivers: serialization (drives hype), playability/design, set reception.
        const likeHook = `Analyze the SET — what people actually like (serialization, playable cards, design); a set with no serialization can still run if it's playable (e.g. Edge of Eternities CBB $500-600).`;
        if (isSL) {
          mechanic    = `Magic Secret Lair (${msrpC}) — LIMITED PRINT RUN since Feb 2026 (no longer print-on-demand); ${multC}. Crossover/licensed IP = strongest hold; original art = weakest (often below MSRP).`;
          holdRisk    = `IP-driven: non-licensed SLs often sit below MSRP; licensed/crossover can run multiples. Confirm which before sizing.`;
        } else if (isCollBooster) {
          mechanic    = `MTG Collector Booster Box (${msrpC}) — 100% rares + foil/serialized treatments; ${multC}. ${likeHook}`;
          holdRisk    = `Play Booster print volume + Standard rotation compress CBB when the set underperforms. Commander playability sustains demand.`;
        } else if (isGiftBundle) {
          mechanic    = `MTG Gift Bundle (${msrpC}); ${multC}. Bundles pack a Collector Booster + extras — different/scarcer cards than a play box; value tracks the included collector content. ${likeHook}`;
          holdRisk    = `Bundle premium fades if the set is weak; the collector content is the only durable value.`;
        } else if (isPlayBox) {
          mechanic    = `MTG Play Box (${msrpC}); ${multC}. Play Boosters carry the COMMON/play cards — trend below MSRP month 2+ unless the set is highly playable. ${likeHook}`;
          holdRisk    = `High Standard print volume → play boxes rarely hold; flip only.`;
        } else {
          mechanic    = `MTG sealed (${msrpC}); ${multC}. Collector Boosters hold better than Play Boosters; ${likeHook}`;
          holdRisk    = `MTG print volumes are high for Standard sets. Niche/crossover IP = safer hold.`;
        }
      } else if (isOnePiece) {
        // Product-TYPE aware — never assume "booster box". OP ranges: Booster Box, Double Box,
        // Collection/Premium sets (Best Selection, Premium Card Collection, Ultra/Starter Decks).
        const isDoubleBox  = /double (pack|box)|2-?pack/i.test(lblLc);
        const isCollection = /collection|premium card|best selection|treasure|ultra deck|starter deck|gift/i.test(lblLc);
        const msrpClause   = r$ ? `${r$} MSRP` : 'MSRP pending verification';
        if (isCollection) {
          mechanic    = `One Piece premium/collection set (${msrpClause}) — fixed-print premium product, NOT booster-odds driven. Value comes from the included alt-art / manga rares / special rares + chase singles. Comp against PRIOR VOLUMES in the same line (e.g. earlier Best Selection / Premium Collection vols) for the appreciation curve.`;
          holdRisk    = `Premium collections are low-allocation but Bandai can re-release the line; prior-volume trajectory + character demand (Luffy/Shanks/Roger/Ace/Zoro) determine the hold. If prior vols faded to MSRP, this likely does too.`;
          ceilingNote = ``;
        } else if (isDoubleBox) {
          mechanic    = `One Piece Double Box / 2-pack (${msrpClause}) — bundled sealed; track per-box-equivalent vs the standalone booster box. Bandai reprints ~1 wave per set (3-6mo). Strong-IP sets (Luffy/Shanks/Roger) sustain 4-7×; weaker sets revert 1.2-1.5×.`;
          holdRisk    = `Reprint wave dilutes sealed premium; exit before Wave 2 restock.`;
          ceilingNote = `Prior strong sets sustained 4-7× before settling ~2-4×.`;
        } else {
          mechanic    = `One Piece TCG booster box (${msrpClause}). Bandai reprints ~1 wave per set (3-6mo post-release). Strong-IP sets (Luffy/Shanks/Roger) sustain 4-7×; weaker sets revert 1.2-1.5×.`;
          holdRisk    = `Reprint wave dilutes sealed premium; plan exit before Wave 2 restock. OP08 (Shanks/Roger) hit 7.2× before settling at 3.9×. Monitor Bandai restock announcements.`;
          ceilingNote = `Prior S-tier sets: OP01 (Luffy) 4.4×, OP08 (Shanks/Roger) 7.2× ATH. OP13 Luffy Gear 5 = S-tier.`;
        }
      } else if (isLEGO) {
        mechanic    = `LEGO sealed (${msrpC}); ${multC}. Active sets sell at/below retail; premium forms ONLY after retirement (EOL). Pre-EOL = dead capital, not an investment.`;
        holdRisk    = `Check BrickEconomy EOL date — the single biggest LEGO price driver. Buying active = 1-3yr hold before scarcity bids; no-IP/educational themes run weak CAGR.`;
      } else {
        mechanic    = mktPrice && retailPrice
          ? `Secondary ${m$} vs retail ${r$} (${mult}×).`
          : mktPrice ? `Secondary at ${m$} — no retail anchor to comp.` : `No secondary data established yet.`;
        holdRisk    = `Category/IP mechanics unknown — verify demand signal before sizing a position.`;
      }

      // ── Thesis ───────────────────────────────────────────────────────────────────
      if (_isProjection) {
        // No own comps exist — every number is from PRIOR volumes of the line. Say so plainly.
        const pc = prod._priorComp;
        const projMed = pc?.median ?? prod.projectedMarket ?? mktPrice;
        const projMult = (projMed && retailPrice) ? `${(projMed / retailPrice).toFixed(1)}× ${r$} MSRP` : '';
        const srcStr = pc ? `prior line "${pc.query}" — median $${pc.median} across ${pc.count} sold ($${pc.low}–$${pc.high})`
                          : (prod.projectedNote ?? `prior volumes of this line`);
        autoMkt.push(`• **Thesis — PRE-ORDER, ships ${prod.releaseDate}; NO vol.7 comps exist yet:** ${mechanic} Pricing below is a PROJECTION off ${srcStr} — NOT this SKU's own sales. On that comp, prior vols run ~$${Math.round(projMed)} (${projMult}). Treat as the template until vol.7's own Day-1 sales land.`);
      } else if (m$ && r$) {
        const trendClause = priceTrendLabel === 'rising'
          ? 'Floor is in — price rising; buy window narrowing.'
          : priceTrendLabel === 'falling'
          ? 'Price compressing — confirm floor before adding size.'
          : 'Secondary stable at current floor.';
        const stockClause = retailInStock
          ? 'Still on shelves at retail — premium will not form until shelves clear.'
          : `OOS at retail — secondary is the only source.`;
        autoMkt.push(`• **Thesis${retailInStock ? ' — retail still active' : ' — OOS'}:** ${mechanic} eBay median ${m$} (${mult}× ${r$} MSRP). ${stockClause} ${trendClause}${ceilingNote ? ` ${ceilingNote}` : ''}`);
      } else if (m$) {
        autoMkt.push(`• **Thesis:** ${mechanic} eBay median ${m$} — no retail anchor; comp cannot compute multiple until retail price confirmed.`);
      } else if (prod._priorComp) {
        const pc = prod._priorComp;
        const pcMult = retailPrice ? ` (${(pc.median / retailPrice).toFixed(1)}× a ${r$} MSRP)` : '';
        autoMkt.push(`• **Thesis — prior-version comp (no current sold data):** ${mechanic} This release has no sold comps yet, so pricing reads off the prior line "${pc.query}": median **$${pc.median}**${pcMult} across ${pc.count} sold ($${pc.low}–$${pc.high}). Treat as the appreciation template until this SKU's own Day-1 sales land.`);
      } else {
        autoMkt.push(`• **Thesis:** ${mechanic} No current sold data and no prior-version line found — re-run after Day 1 sales, or set a siblingQuery to anchor the comp.`);
      }

      // ── Liquidity ────────────────────────────────────────────────────────────────
      if (_isProjection) {
        const v = sold30 ?? sold90 ?? null;
        const mentClause = mentions > 5 ? ` ${mentions} channel mentions (${sentLabel} sentiment).` : '';
        autoMkt.push(`• **Liquidity (prior-version proxy):** vol.7 has no sales yet; the PRIOR line moves ${v != null ? `~${v} sold/30d` : 'an unknown volume'} on eBay — read as demand depth for the line, not vol.7.${mentClause}`);
      } else if (sold30 != null || sold90 != null) {
        const velocity  = sold30 != null ? `${sold30} sold/30d` : `${sold90} sold/90d`;
        const liqTier   = (sold30 ?? 0) >= 50 ? 'strong' : (sold30 ?? 0) >= 20 ? 'moderate' : 'thin';
        const mentClause = mentions > 5 ? ` ${mentions} channel mentions (${sentLabel} sentiment).` : '';
        autoMkt.push(`• **Liquidity:** ${liqTier} — ${velocity} on eBay.${mentClause} ${momentumLine}`);
      } else {
        const mentClause = mentions > 5 ? ` ${mentions} channel mentions (${sentLabel} sentiment) indicate demand forming.` : ' No velocity data yet — re-run after release.';
        autoMkt.push(`• **Liquidity:**${mentClause}`);
      }

      // ── Chase singles from local DB (TCG categories only) ────────────────────────
      if (dbChaseCards.length && (isOnePiece || isMTG || isLorcana)) {
        const chStr = dbChaseCards.map(c => `${c.name} $${c.market.toFixed(0)}${c.rarity ? ` (${c.rarity})` : ''}`).join(' · ');
        autoMkt.push(`• **Chase singles (live DB):** ${chStr}`);
      }

      // ── Risk ─────────────────────────────────────────────────────────────────────
      const riskExtra = [];
      if (wholesaleFloor) riskExtra.push(`wholesale avg $${wholesaleFloor} sets a dealer floor`);
      if (mult && +mult < 1.2) riskExtra.push(`${mult}× multiple is thin — fees will eat margin on anything under 1.2×`);
      if (sentVal < 0 && mentions > 3) riskExtra.push(`negative community sentiment (${mentions} mentions)`);
      autoMkt.push(`• **Risk:** ${holdRisk}${riskExtra.length ? ' ' + riskExtra.join('; ') + '.' : ''}`);

      // (Live checkout-feed line removed per user — not wanted in Market Analysis.)

      // Inject analyst corrections as a context note (user-facing, shapes the read)
      if (prod._userNotes) {
        const stripped = prod._userNotes.replace(/\n+/g, ' ').trim().slice(0, 200);
        autoMkt.push(`• **Analyst note:** ${stripped}`);
      }

      market_ = autoMkt.join('\n');
    } else {
      market_ = authoredMarket;
    }
    if (market_.length > 1020) market_ = market_.slice(0, 1017) + '...';
    setAnalysis_ = null;
  }

  const advanced = generateAdvancedSections(prod, signals, market, feedIntel, docsCtx);
  return {
    market:       market_,
    setAnalysis:  setAnalysis_,
    setTier:      isPokemon ? (comp?.tier ?? null) : (() => { const cs = categorySetScore(prod); return cs ? categoryTierOf(cs.score) : null; })(),
    product:      product_,
    priceComp:    '',
    recs:         '',
    ...advanced,
  };
}

// ── Enrich SET_INTEL with live card data from pokemontcg.io + Bulbapedia ──────
const setKey = Object.keys(SET_INTEL).filter(k => prod.set?.includes(k) || prod.label?.includes(k)).sort((a,b)=>b.length-a.length)[0];
if (setKey && SET_INTEL[setKey]) {
  const liveSetData = await resolveSetIntel(setKey).catch(() => null);
  if (liveSetData) {
    const liveIp = buildIpLine(liveSetData);
    if (liveIp) SET_INTEL[setKey].ip = liveIp;
    if (liveSetData.bulbapedia && !SET_INTEL[setKey].narrative) {
      SET_INTEL[setKey].narrative = liveSetData.bulbapedia.slice(0, 300).replace(/\n+/g, ' ').trim();
    }
    if (liveSetData.meta?.releaseDate && !SET_INTEL[setKey]._releaseDate) {
      SET_INTEL[setKey]._releaseDate = liveSetData.meta.releaseDate;
    }
    console.log(`[set-intel] Enriched '${setKey}': ${liveSetData.megaExCards?.length ?? 0} Mega ex, ${liveSetData.topChase?.length ?? 0} SIR/HR`);
  }
}

// ── Claude CLI synthesis when user corrections present ───────────────────────
// Spawns `claude -p` with signals + corrections → get back structured market analysis.
// Uses existing Claude Code subscription, no API key needed.
if (prod._userNotes && signals && prod.category !== 'pokemon') {
  try {
    const { execFileSync } = await import('child_process');
    const signalSummary = [
      signals.ebay    ? `eBay: median $${signals.ebay.median}, sold30=${signals.ebay.sold30 ?? 'n/a'}, sold90=${signals.ebay.sold90 ?? 'n/a'}` : 'eBay: N/A',
      signals.amazon  ? `Amazon: $${signals.amazon.price} (${signals.amazon.inStock ? 'in stock' : 'OOS'})` : 'Amazon: N/A',
      signals.walmart ? `Walmart: $${signals.walmart.price} (${signals.walmart.inStock ? 'in stock' : 'OOS'})` : 'Walmart: N/A',
      signals.stockx  ? `StockX: $${signals.stockx.price}` : 'StockX: N/A',
      signals.discord ? `Discord: ${signals.discord.mentions} mentions` : null,
      signals.reddit  ? `Reddit: ${signals.reddit.mentions} mentions, sentiment ${signals.reddit.sentiment}` : null,
    ].filter(Boolean).join('\n');
    const prompt = `You are a BCG/McKinsey-level collectibles market analyst writing a Discord embed field (max 1020 chars).

Product: ${prod.label} (${prod.set ?? prod.category})
Retail: $${prod.retail ?? 'unknown'}
Market (weighted avg): $${market ?? 'unknown'}

Live signals:
${signalSummary}

Analyst corrections from the user:
${prod._userNotes}

Write EXACTLY 3 bullet lines — no more, no less — in this format:
• **Thesis — [label]:** [specific claim with numbers, why someone should buy/skip vs comparable products]
• **Liquidity:** [velocity + sentiment data]
• **Risk:** [structural risk that caps the thesis]

Rules: no filler, no hedging, numbers in every bullet, reference the user corrections where relevant. Output only the 3 bullets, nothing else.`;
    const out = execFileSync('claude', ['-p', prompt], { encoding: 'utf8', timeout: 30000, windowsHide: true }).trim();
    if (out && out.includes('**Thesis') && out.includes('**Liquidity') && out.includes('**Risk')) {
      prod._claudeMarket = out;
      console.log('  [claude-synthesis] market writeup generated from corrections');
    }
  } catch (e) {
    console.log(`  [claude-synthesis] skipped: ${e.message?.slice(0, 80)}`);
  }
}

const docsCtx = readDocsContext(prod.category);
const liveWriteup = signals ? generateWriteup(prod, signals, market, roi, t30Market, t30Roi, computedRating, netProfit, feedIntel, docsCtx) : prod.writeup;
const writeup = liveWriteup ?? prod.writeup;

// TL:DR: "🟢 FULL SEND | S Tier | $6.99 | $14.25"
// setTier: _tierLabel (forceRating-derived) always wins; writeup.setTier only used for Pokemon set scoring.
const setTier = _tierLabel ?? writeup?.setTier ?? null;
const tldrRetail = prod.retail2 ? `${fmt$(prod.retail2)} (${prod.dealNote ?? 'sale'})` : prod.retail ? fmt$(prod.retail) : detectedRetail ? fmt$(detectedRetail) : '`N/A`';
const tldrMarket = market ? fmt$(market) : (prod.presaleMarket ?? '`N/A`');
const tldr = `### TL:DR\n> **${sendLabel}${setTier ? ` | ${setTier} Tier` : ''}** | ${tldrRetail} | ${tldrMarket}`;

if (writeup) {
  fields.push({ name: '📊 Market Analysis', value: writeup.market, inline: false });
  // Product Analysis — always strip Bear/Base/Bull since they now live in the Scenarios field.
  const prodText = (writeup.product || '').split('\n')
    .filter(l => !/^\s*\*{0,2}(Bear|Base|Bull)\*{0,2}\s*[\(:]|Prob-weighted/i.test(l))
    .join('\n').replace(/\n{2,}/g, '\n').trimEnd();
  if (prodText.trim()) fields.push({ name: '📦 Product Analysis', value: prodText, inline: false });
  if (writeup.setAnalysis) fields.push({ name: '🆚 Set Analysis', value: writeup.setAnalysis, inline: false });

  // ── Advanced analysis sections ──────────────────────────────────────────────
  // 📊 Scenarios (Bear/Base/Bull moved here from Product Analysis)
  if (writeup.scenarios) fields.push({ name: '📊 Scenarios', value: writeup.scenarios.slice(0, 1020), inline: false });
  // Closest Comps before Exit Window (user rule)
  if (writeup.closestComps) fields.push({ name: '🔀 Closest Comps', value: writeup.closestComps.slice(0, 1020), inline: false });
  if (writeup.exitWindow) fields.push({ name: '⏱️ Exit Window', value: writeup.exitWindow.slice(0, 1020), inline: false });
  // Demand Drivers + Catalysts removed from embed — integrated into research psychology only
} else if (prod.notes) {
  fields.push({ name: '📝 Writeup', value: prod.notes + (isPokemon && PRINT_RISK ? '\n' + PRINT_RISK : ''), inline: false });
}

// ── Persist real sold-comp data back to set-scores.json (replaces hand-typed) ──
// Records the live sold median + running-max multiple per set, so the comparison
// DB self-populates with REAL eBay-sold data over time instead of estimates.
try {
  const persistKey = prod._dbKey && SET_SCORES[prod._dbKey]
    ? prod._dbKey
    : Object.keys(SET_SCORES).filter(k => SET_SCORES[k]?.scale !== 'vintage' && (prod.set?.includes(k) || prod.label?.includes(k))).sort((a,b)=>b.length-a.length)[0];
  const soldMed = signals?.ebay?.soldMedian30 ?? signals?.ebay?.median ?? null;
  if (persistKey && market && prod.retail && _setScoresRaw.sets?.[persistKey]) {
    const liveMult = +(market / prod.retail).toFixed(2);
    const rec = _setScoresRaw.sets[persistKey];
    rec.observedPeakMultiple = Math.max(rec.observedPeakMultiple ?? 0, liveMult);
    rec.lastMultiple = liveMult;
    if (soldMed) rec.lastSoldMedian = +soldMed.toFixed(2);
    rec.lastUpdated = new Date().toISOString().slice(0, 10);
    writeFileSync(_setScoresPath, JSON.stringify(_setScoresRaw, null, 2) + '\n');
    console.log(`  [set-scores] ${persistKey}: peak ${rec.observedPeakMultiple}× (live ${liveMult}×, sold med $${rec.lastSoldMedian ?? '—'})`);
  }
} catch (e) { console.log('  [set-scores] persist skipped:', e.message); }

// DB append is now STAGED (pipelineResult.dbAppend) and written ONLY on user confirm via the
// dashboard (POST /api/confirm-db-save). No category DB auto-writes here — user gates it so a
// bad writeup never auto-pollutes the DB. (Applies to ALL categories, incl noncard.)

// ── Build embeds ───────────────────────────────────────────────────────────────
const ratingEmoji = RATING_EMOJI[computedRating] ?? '';
// Auto-fetch TCGPlayer image ONLY for TCG products without an image.
// Topps/noncard must NOT query TCGplayer — it wrong-matches (e.g. "Hobbit" for a Topps box).
// When tcgId is already set, use it directly — never let a name-search override an explicit ID.
const tcgImageEligible = !prod.imageUrl && !prod.images?.length &&
  (prod.category === 'pokemon' || prod.category === 'one_piece' || prod.category === 'other_tcg' ||
   /pok[eé]mon|mega evolution|\bsv\d|magic|secret lair|lorcana|one.piece/i.test(`${prod.set} ${prod.label}`));
if (tcgImageEligible) {
  if (prod.tcgId) {
    // Explicit tcgId → use it directly; never let a name-search clobber it with a wrong match
    prod.images = [prod.tcgId];
    console.log(`  [tcg-image] using explicit tcgId ${prod.tcgId}`);
  } else {
    const tcgSearch = await tcgProductSearch(prod.label, { category: prod.category ?? 'pokemon' });
    if (tcgSearch?.productId) {
      prod.images = [tcgSearch.productId];
      if (!prod.releaseUrl) prod.releaseUrl = tcgSearch.productUrl;
      // For non-Pokemon TCG: also save tcgId so next run gets live market price without re-searching
      if (prod.category !== 'pokemon') {
        prod.tcgId = parseInt(tcgSearch.productId, 10) || tcgSearch.productId;
        console.log(`  [tcg-auto] saved tcgId ${prod.tcgId} → ${prod.label}`);
      }
      console.log(`  [tcg-image] found product ${tcgSearch.productId} → ${tcgSearch.imageUrl}`);
    }
  }
}

const isPokemonProduct = prod.category === 'pokemon' || prod.set?.toLowerCase().includes('mega evolution') || prod.set?.toLowerCase().includes('sv') || prod.label?.toLowerCase().includes('pokémon') || prod.label?.toLowerCase().includes('pokemon');
const titlePrefix = isPokemonProduct ? 'Pokémon TCG — ' : '';
const labelDisplay = prod.label.replace(/\b(\w)/g, c => c.toUpperCase());
const title   = `${ratingEmoji} ${titlePrefix}${labelDisplay} (${prod.set})`;
const ebayUrl = ebay(prod.ebayQuery);

const embeds = [
  {
    color:       COLORS[computedRating],
    title,
    url:         prod.releaseUrl ?? ebayUrl,
    description: tldr,
    thumbnail:   prod.imageUrl ? { url: prod.imageUrl } : prod.images[0] ? { url: cdn(prod.images[0]) } : undefined,
    fields,
    footer:      { text: `Fiddler Research | ${prod.set}: ${prod.label} — Live data ${new Date().toLocaleDateString('en-US')}` },
  },
];

// ── Evidence gate ────────────────────────────────────────────────────────────────
// Forward/judgment products (preRelease or forceRating) MUST carry >=3 dated, sourced
// data points before posting — kills "assumed number" + "one WebSearch" + confirmation-bias
// failures. prod.evidence = [{ source, date, point }]. Override only with EVIDENCE_OK=1.
// ── DB append (runs unconditionally — before any gate that may exit) ──────────
// HARD RULE: every pipeline run = DB record, no exceptions (DASHBOARD_MODE, evidence gate, etc.)
try {
  const _dbAppendEarly = (() => {
    const _DB = { pokemon:'set-history.json', mtg:'set-history-mtg.json', lorcana:'set-history-lorcana.json', sports:'set-history-sports.json', topps:'set-history-sports.json', disney_cards:'set-history-disney-cards.json', other_tcg:'set-history-other-tcg.json', one_piece:'set-history-one-piece.json', 'one-piece':'set-history-one-piece.json', weiss:'set-history-weiss.json', union_arena:'set-history-union-arena.json', gundam:'set-history-gundam.json', yugioh:'set-history-yugioh.json', cardfight:'set-history-cardfight.json', dragon_ball:'set-history-dragon-ball.json', fab:'set-history-fab.json', digimon:'set-history-digimon.json', sorcery:'set-history-sorcery.json', star_wars:'set-history-star-wars.json', hololive:'set-history-hololive.json', lego:'set-history-lego.json', noncard:'set-history-noncard.json', veefriends:'set-history-veefriends.json', mattel:'set-history-mattel.json' };
    const _cat = (prod.category ?? 'noncard').toLowerCase();
    const _dbPath = join(ROOT, _DB[_cat] ?? 'set-history-noncard.json');
    const _db = existsSync(_dbPath) ? JSON.parse(readFileSync(_dbPath, 'utf8')) : { _meta: {}, sets: {} };
    if (!_db.sets) _db.sets = {};
    const _prev = _db.sets[productKey];
    const _hist = Array.isArray(_prev?.history) ? _prev.history : (_prev ? [{ market: _prev.market ?? null, rating: _prev.rating ?? null, dateLogged: _prev.dateLogged ?? null }] : []);
    const _today = new Date().toISOString().slice(0, 10);
    const _chaseTotal = dbChaseCards.length;
    const _avgChasePrice = _chaseTotal ? +(dbChaseCards.reduce((s,c) => s + (c.market ?? 0), 0) / _chaseTotal).toFixed(2) : null;
    const _rec = {
      name: prod.label, category: _cat, set: prod.set ?? null,
      tcgId: prod.tcgId ?? null,
      retail: prod.retail ?? null, retailVerified: !!prod.retailVerified,
      market: market ? +market.toFixed(2) : null,
      soldMedian: signals?.ebay?.soldMedian30 ?? signals?.ebay?.median ?? null,
      sold30: signals?.ebay?.sold30 ?? null, sold90: signals?.ebay?.sold90 ?? null,
      rating: computedRating, tier: ratingResult?.tier ?? null,
      roi: roi ?? null, netProfit: netProfit != null ? +netProfit.toFixed(2) : null,
      releaseDate: prod.releaseDate ?? null,
      dateLogged: _today,
      cards: _chaseTotal ? {
        chaseCards: dbChaseCards.map(c => ({ name: c.name, market: c.market, rarity: c.rarity ?? null })),
        chaseTotal: _chaseTotal, avgChasePrice: _avgChasePrice, fetchedAt: _today,
      } : (_prev?.cards ?? null),
      writeup: liveWriteup ? {
        market: liveWriteup.market ?? '', product: liveWriteup.product ?? '',
        priceComp: liveWriteup.closestComps ?? prod.writeup?.priceComp ?? '',
        supplyDemand: prod.writeup?.supplyDemand ?? '', recs: prod.writeup?.recs ?? '',
      } : null,
    };
    _db.sets[productKey] = { ..._prev, ..._rec, key: productKey, history: [..._hist, { market: _rec.market, rating: _rec.rating, soldMedian: _rec.soldMedian, dateLogged: _rec.dateLogged }].slice(-24) };
    _db._meta = { ...(_db._meta ?? {}), updated: _rec.dateLogged };
    writeFileSync(_dbPath, JSON.stringify(_db, null, 2) + '\n');
    return _DB[_cat] ?? 'set-history-noncard.json';
  })();
  console.log(`  [db] appended → ${_dbAppendEarly} [${productKey}]`);
} catch (e) { console.warn('  [db] auto-append failed:', e.message); }

if ((prod.preRelease || prod.forceRating) && !process.env.EVIDENCE_OK) {
  const ev = Array.isArray(prod.evidence) ? prod.evidence : [];
  const ok = ev.filter(e => e?.source && e?.date && e?.point);
  if (ok.length < 3) {
    console.error(`\n❌ EVIDENCE GATE FAILED for ${productKey}: ${ok.length}/3 dated sourced data points.`);
    console.error('   Required before posting a forward/judgment product: live cost, full price curve, intel-channel read — each as {source,date,point}.');
    console.error('   Do the DEEP research, populate prod.evidence (>=3), then re-run. (override: EVIDENCE_OK=1)');
    process.exit(1);
  }
  console.log(`✓ evidence gate: ${ok.length} sourced data points`);
}

// ── Retail sanity check ───────────────────────────────────────────────────────
// If prod.retail is set+verified AND StockX returned a different MSRP, flag mismatch >20%.
// Prevents wrong-SKU StockX pulls from silently poisoning retail (e.g. Skyline R32 vs Stagea).
if (!process.env.SKIP_RETAIL_CHECK && prod.retail && prod.retailVerified && signals?.stockx?.msrp) {
  const _sxMsrp = signals.stockx.msrp;
  const _diff = Math.abs(_sxMsrp - prod.retail) / prod.retail;
  if (_diff > 0.20) {
    console.error(`\n⚠️  RETAIL MISMATCH: prod.retail $${prod.retail} vs StockX MSRP $${_sxMsrp} (${Math.round(_diff*100)}% gap).`);
    console.error(`   Likely wrong StockX SKU matched. Verify retail source: ${prod.retailSource ?? 'none'}`);
    console.error(`   Fix prod.retail in dynamic-products.json or set SKIP_RETAIL_CHECK=1 to override.`);
    if (!process.env.EVIDENCE_OK) process.exit(1);
    console.warn('   EVIDENCE_OK set — proceeding despite mismatch.');
  } else {
    console.log(`✓ retail sanity: $${prod.retail} vs StockX $${_sxMsrp} (${Math.round(_diff*100)}% delta — OK)`);
  }
}

// ── Writeup gate ─────────────────────────────────────────────────────────────
// topps/sports/noncard/mattel products require at minimum a market writeup before posting.
// An empty writeup = no analysis = the embed is just numbers with no context → BLOCK.
const _writeupGateCategories = ['topps', 'sports', 'noncard', 'mattel', 'lego', 'vinyl'];
const _needsWriteup = _writeupGateCategories.some(c => (prod.category ?? '').toLowerCase().includes(c));
if (_needsWriteup && !process.env.SKIP_WRITEUP_CHECK) {
  const _wu = prod.writeup ?? {};
  const _filled = ['market','product','priceComp','supplyDemand','recs'].filter(k => (_wu[k] ?? '').trim().length > 20);
  if (_filled.length < 2) {
    console.error(`\n❌ WRITEUP GATE FAILED for ${productKey}: only ${_filled.length}/5 writeup fields populated.`);
    console.error(`   Categories [${_writeupGateCategories.join('/')}] require market + product analysis before posting.`);
    console.error(`   Populate writeup.market + writeup.product (min 20 chars each) in dynamic-products.json.`);
    console.error(`   Override: SKIP_WRITEUP_CHECK=1`);
    process.exit(1);
  }
  console.log(`✓ writeup gate: ${_filled.length}/5 fields populated (${_filled.join(', ')})`);
}

// ── Send ───────────────────────────────────────────────────────────────────────
// When spawned from dashboard (DASHBOARD_MODE=1), skip auto-post — user reviews + sends manually
if (process.env.DASHBOARD_MODE === '1') {
  console.log('DASHBOARD_MODE: skipping auto-post — review in webhook preview, then click Send.');
} else {
  console.log('\nSending embed...');
  let r;
  if (CHANNEL_ID) {
    r = await fetch(`https://discord.com/api/v9/channels/${CHANNEL_ID}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
      body:    JSON.stringify({ embeds }),
    });
  } else {
    r = await fetch(WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ embeds }),
    });
  }
  if (!r.ok) {
    console.error('FAILED', r.status, await r.text());
    process.exit(1);
  }
  console.log(`SENT ${r.status} — ${prod.label}`);
}
if (market) console.log(`  TCGPlayer market: $${market} | low: $${low} | high: $${high}`);
if (netProfit) console.log(`  Net profit: $${netProfit.toFixed(2)}/unit | ${roi}% ROI`);

// Write structured pipeline results for dashboard checklist
const isSports = (prod.category ?? '').toLowerCase() === 'sports';
const isTCG    = ['pokemon','mtg','lorcana','other_tcg'].includes((prod.category ?? '').toLowerCase()) || isSports;
const _q = encodeURIComponent(prod.ebayQuery);
const _envWh = [
  { name: 'Fiddler',   url: env.EXTERNAL_WEBHOOK_URL },
  { name: 'Channel 2', url: env.WEBHOOK_2 },
  { name: 'Channel 3', url: env.WEBHOOK_3 },
  { name: 'Channel 4', url: env.WEBHOOK_4 },
  { name: 'Channel 5', url: env.WEBHOOK_5 },
].filter(w => w.url);
const pipelineResult = {
  key: productKey, label: prod.label, category: prod.category ?? 'noncard',
  runAt: new Date().toISOString(),
  webhooks: _envWh,
  pricing: {
    ebay:      { ...(signals?.ebay ? { status:'ok', data:`median $${signals.ebay.median} (sold30 ${signals.ebay.sold30 ?? 'n/a'} / sold90 ${signals.ebay.sold90 ?? 'n/a'} / active ${signals.ebay.activeCount ?? 'n/a'})` } : { status:'na', data:'N/A' }), url: ebayUrl },
    target:    { ...(signals?.target ? { status:'ok', data:`$${signals.target.price} (${signals.target.inStock ? 'in stock' : 'OOS'})` } : { status:'na', data:'N/A' }), url: `https://www.target.com/s?searchTerm=${_q}` },
    amazon:    { ...(signals?.amazon ? { status:'ok', data:`$${signals.amazon.price} (${signals.amazon.inStock ? 'in stock' : 'OOS'})` } : { status:'na', data:'N/A' }), url: amazonUrl },
    walmart:   { ...(signals?.walmart ? { status:'ok', data:`$${signals.walmart.price} (${signals.walmart.inStock ? 'in stock' : 'OOS'})` } : { status:'na', data:'N/A' }), url: walmartUrl },
    stockx:    { ...(signals?.stockx ? { status:'ok', data:`$${signals.stockx.price} (ask $${signals.stockx.lowestAsk ?? 'n/a'} / bid $${signals.stockx.highestBid ?? 'n/a'})` } : { status:'na', data:'N/A' }), url: `https://stockx.com/search?s=${_q}` },
    tcgplayer: { ...(tcg?.market ? { status:'ok', data:`market $${tcg.market} | low $${tcg.low ?? 'n/a'} | high $${tcg.high ?? 'n/a'}` } : { status:'na', data:'N/A' }), url: tcgUrl ?? `https://www.tcgplayer.com/search/all/product?q=${_q}` },
    pricecharting: { ...(pcDbPrice ? { status:'ok', data:`booster-box $${pcDbPrice} (indexed DB)` } : { status:'na', data:'N/A' }), url: 'https://www.pricecharting.com/' },
    dealernetx:{ ...(signals?.historicalWholesale?.length ? { status:'ok', data:`${signals.historicalWholesale.length} results (prior year avg)` } : { status:'na', data:'N/A' }) },
    internalDb:{ status:'ok', data:`products map loaded — retail $${prod.retail}` },
    market:    { ...(market ? { status:'ok', data:`weighted avg $${market} from: ${priceSources.map(s => `${s.label} $${s.price} (w${s.weight})`).join(', ')}` } : { status:'err', data:'No market price computed — all sources N/A' }) },
  },
  sentiment: {
    reddit:    { ...(signals?.reddit ? { status:'ok', data:`${signals.reddit.mentions} mentions, sentiment ${signals.reddit.sentiment}` } : { status:'na', data:'N/A' }), url: `https://www.reddit.com/search/?q=${_q}` },
    x:         { ...(signals?.x ? { status:'ok', data:`${signals.x.count} tweets, sentiment ${signals.x.sentiment}` } : { status:'na', data:'N/A' }), url: `https://x.com/search?q=${_q}` },
    instagram: { ...(signals?.instagram ? { status:'ok', data:`${signals.instagram.count} posts` } : { status:'na', data:'N/A' }), url: `https://www.instagram.com/explore/tags/${encodeURIComponent((prod.ebayQuery).replace(/\s+/g,''))}` },
    facebook:  { ...(signals?.facebook ? { status:'ok', data:`${signals.facebook.count} posts, sentiment ${signals.facebook.sentiment}` } : { status:'na', data:'N/A' }), url: `https://www.facebook.com/search/top?q=${_q}` },
    discord:   { ...(signals?.discord ? { status:'ok', data:`${signals.discord.mentions} mentions` } : { status:'na', data:'N/A' }) },
    whatnot:   { ...(signals?.whatnot ? { status:'ok', data:`${signals.whatnot.count} listings, sentiment ${signals.whatnot.sentiment}` } : { status:'na', data:'N/A' }), url: `https://www.whatnot.com/live/search?query=${_q}` },
    google:    { status:'ok', data:'Bing/DDG search snippets fetched', url: `https://www.google.com/search?q=${_q}` },
    blowout:   { ...(signals?.blowout ? { status:'ok', data:`${signals.blowout.count} threads, sentiment ${signals.blowout.sentiment}` } : { status: isTCG ? 'na' : 'skip', data: isTCG ? 'no threads found' : 'N/A' }), url: isTCG ? `https://www.blowoutforums.com/showresults.php?ps=1&q=${_q}` : undefined },
    youtube:   { ...(signals?.youtube ? { status:'ok', data:`${signals.youtube.count} videos, sentiment ${signals.youtube.sentiment}` } : { status: isTCG ? 'na' : 'skip', data: isTCG ? 'no videos found' : 'N/A' }), url: isTCG ? `https://www.youtube.com/results?search_query=${_q}+box+break` : undefined },
  },
  evidence:  { count: (prod.evidence ?? []).length, gate: (prod.evidence ?? []).length >= 3 ? 'passed' : 'failed', items: prod.evidence ?? [] },
  risk:         riskResult,
  rating:       computedRating,
  embed:        { status: process.env.DASHBOARD_MODE === '1' ? 'pending-review' : (typeof r !== 'undefined' ? (r.ok ? `SENT ${r.status}` : `FAILED ${r.status}`) : 'unknown') },
  embedPayload: embeds[0],
  // STAGED DB append — built every run but NOT written. The dashboard shows a Confirm Save
  // button; only on user confirm does /api/confirm-db-save write this into the category DB.
  // (User gates it so a bad writeup never auto-pollutes the DB.) Verified data only.
  dbAppend: (() => {
    const DB_BY_CAT2 = { pokemon:'set-history.json', mtg:'set-history-mtg.json', lorcana:'set-history-lorcana.json', sports:'set-history-sports.json', topps:'set-history-sports.json', disney_cards:'set-history-disney-cards.json', other_tcg:'set-history-other-tcg.json', one_piece:'set-history-one-piece.json', 'one-piece':'set-history-one-piece.json', weiss:'set-history-weiss.json', union_arena:'set-history-union-arena.json', gundam:'set-history-gundam.json', yugioh:'set-history-yugioh.json', cardfight:'set-history-cardfight.json', dragon_ball:'set-history-dragon-ball.json', fab:'set-history-fab.json', digimon:'set-history-digimon.json', sorcery:'set-history-sorcery.json', star_wars:'set-history-star-wars.json', hololive:'set-history-hololive.json', lego:'set-history-lego.json', noncard:'set-history-noncard.json', veefriends:'set-history-veefriends.json' };
    const cat = (prod.category ?? 'noncard').toLowerCase();
    const dbFile = DB_BY_CAT2[cat] ?? 'set-history-noncard.json';
    const soldMed = signals?.ebay?.soldMedian30 ?? signals?.ebay?.median ?? null;
    return {
      dbFile, category: cat, key: productKey,
      record: {
        name: prod.label, category: cat,
        retail: prod.retail ?? null, retailVerified: !!prod.retailVerified,
        market: market ? +market.toFixed(2) : null,
        soldMedian: soldMed ? +soldMed.toFixed(2) : null,
        sold30: signals?.ebay?.sold30 ?? null, sold90: signals?.ebay?.sold90 ?? null,
        rating: computedRating, tier: ratingResult?.tier ?? null,
        roi: roi ?? null, netProfit: netProfit != null ? +netProfit.toFixed(2) : null,
        releaseDate: prod.releaseDate ?? null,
        writeup: liveWriteup ? {
          market: liveWriteup.market ?? '', product: liveWriteup.product ?? '',
          priceComp: liveWriteup.closestComps ?? prod.writeup?.priceComp ?? '',
          supplyDemand: prod.writeup?.supplyDemand ?? '', recs: prod.writeup?.recs ?? '',
        } : null,
        dateLogged: new Date().toISOString().slice(0, 10),
      },
    };
  })(),
};
writeFileSync(join(ROOT, 'pipeline-results.json'), JSON.stringify(pipelineResult, null, 2));
console.log('  [dashboard] pipeline-results.json updated');

// ── Auto-log every pipeline run ───────────────────────────────────────────────
try {
  const logPath = join(ROOT, 'research-log.json');
  const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : [];
  log.push({
    ts:        new Date().toISOString(),
    key:       productKey,
    label:     prod.label,
    category:  prod.category,
    rating:    computedRating,
    market:    marketPrice,
    retail:    prod.retail ?? null,
    roi:       roi ?? null,
    sent:      !process.env.DASHBOARD_MODE,
  });
  writeFileSync(logPath, JSON.stringify(log, null, 2));
} catch {}

