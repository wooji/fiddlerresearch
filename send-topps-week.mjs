const WEBHOOK_URL = 'https://discord.com/api/webhooks/1516299027161944155/DbCEygRpwa0qrs38Otw4_UqeM7Zs5LE8waMQtO-KggcAhU1HeeSQhbBuxBWlcGhdkp31';

// Colors
const GREEN  = 5763719;   // 🟢
const ORANGE = 16747520;  // 🟠
const RED    = 16711680;  // 🔴

function ebay(q) {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc`;
}

async function send(embeds, content = '') {
  const body = { content, embeds, allowed_mentions: { roles: ['728662538656677888'] } };
  const r = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error('FAIL', r.status, await r.text());
  else console.log('OK:', embeds[0]?.title?.slice(0, 60));
  await new Promise(res => setTimeout(res, 1200));
}

// ─── FRAMEWORK ────────────────────────────────────────────────────────────────
await send([{
  color: 0x5865F2,
  title: '📋 Topps Demand Framework — Fiddler',
  description: [
    '**Key signals, in order of importance:**',
    '``1. Print Run`` — lower = more upside; back-calc from CL size × numbered ratios',
    '``2. Checklist Quality`` — star power drives pull value and box demand',
    '``3. Auto Type`` — On-Card > Sticker (~20-30% haircut on sticker pulls)',
    '``4. Auto Density`` — autos/box × numbered depth (/10 > /25 > /99 > /150)',
    '``5. Release Method`` — EQL (controlled, bot-resistant) > FCFS',
    '``6. Historical Comp`` — same product last year is the #1 predictor',
    '``7. Sport/IP Tier`` — Football > Basketball > Baseball > Soccer > Collab',
    '``8. EPL Fatigue`` — active: EPL boxes trending under retail right now',
    '``9. Case Premium`` — sealed cases 10-15% over 12× box; no-case = no premium',
    '``10. Price-to-Hit`` — MSRP ÷ autos/box; dirty CL = hard ceiling',
    '',
    '**Format:** 🟢 Cook | 🟠 Cautious | 🔴 Avoid',
  ].join('\n'),
  footer: { text: 'Fiddler Research • Week of June 15, 2026' },
}]);

// ─── 1. Dynamic Duals Baseball ────────────────────────────────────────────────
await send([{
  color: GREEN,
  title: '🟢 2026 Topps Dynamic Duals Baseball ⚾',
  url: 'https://www.topps.com/pages/topps-mlb-dynamic-duals',
  fields: [
    { name: '📅 Date / Method', value: 'Mon 6/15 — Pre-Order (already flew)', inline: false },
    { name: '💰 MSRP', value: '``$299.99``', inline: true },
    { name: '📦 Case (10 boxes)', value: '``$2,999.90``', inline: true },
    { name: '​', value: '​', inline: false },
    { name: '📦 Config', value: '5 packs × 5 cards | 1 Dual Auto (/99 or less)', inline: true },
    { name: '🖊️ Auto Type', value: '``Sticker (confirmed)``', inline: true },
    { name: '📋 Checklist', value: 'Similar to prior years. CL posted 25 min before drop.', inline: false },
    { name: '📊 Historical', value: '``2025: $180 → $250 drop → $350-400 (1mo) → $500-600+ now``\n``2024: Same trajectory``\n``2026: $300 MSRP (+67%) — only dual auto baseball product``', inline: false },
    { name: '📈 Target Sell-Through', value: '**Flip (<1 mo):** ``$400 – 450 | ~40 – 60 boxes``\n**Hold (3 mo):**  ``$450 – 550 | ~20 – 30 boxes``\n**Invest (1 yr):** ``$500 – 600+ | ~10 – 15 boxes``', inline: false },
    { name: '📊 eBay Sold Comps', value: `[Dynamic Duals Baseball — Sold Listings](${ebay('2026 Topps Dynamic Duals Baseball Hobby Box')})`, inline: false },
    { name: '⚠️ Verdict', value: '``Stock flew on drop — confirmed cook. Unique positioning as the ONLY dual auto baseball set. Price increase hurts entry but historical pattern is ironclad.``', inline: false },
  ],
  footer: { text: 'Fiddler Research • Topps' },
}]);

// ─── 2. Pristine Premier League ───────────────────────────────────────────────
await send([{
  color: ORANGE,
  title: '🟠 2025-26 Topps Pristine Premier League ⚽',
  url: 'https://www.topps.com/pages/topps-pristine-premier-league',
  fields: [
    { name: '📅 Date / Method', value: 'Tues 6/16 — Pre-Order', inline: false },
    { name: '💰 MSRP', value: '``$389.99``', inline: true },
    { name: '📦 Case (12 boxes)', value: '``$4,679.88``', inline: true },
    { name: '​', value: '​', inline: false },
    { name: '📦 Config', value: '6 packs × 10 cards | 2 encased autos + 1 encased auto relic + 3 numbered parallels', inline: false },
    { name: '🖊️ Auto Type', value: '``Encased — some on-card + match worn possible``', inline: false },
    { name: '⚡ Market Context', value: '``EPL fatigue active — most EPL 1-2 auto boxes trading $200-300``\n``$389 is steep vs. comp EPL products``\n``Upside only if match worn / on-card autos appear``', inline: false },
    { name: '📈 Target Sell-Through', value: '**Flip (<1 mo):** ``$390 – 430 | ~20 – 30 boxes``\n**Hold (3 mo):**  ``$370 – 410 | ~10 – 20 boxes``\n**Invest (1 yr):** ``$400 – 450 | ~5 – 10 boxes``', inline: false },
    { name: '📊 eBay Sold Comps', value: `[Pristine Premier League — Sold Listings](${ebay('2025-26 Topps Pristine Premier League Hobby Box')})`, inline: false },
    { name: '⚠️ Verdict', value: '``Cautious. EPL market is soft, $389 is expensive, design concerns flagged early. Circle back release day — if match worn / on-card pulls appear in early breaks, re-enter.``', inline: false },
  ],
  footer: { text: 'Fiddler Research • Topps' },
}]);

// ─── 3. Chrome Disney ─────────────────────────────────────────────────────────
await send([{
  color: GREEN,
  title: '🟢 2026 Topps Chrome Disney 🏰',
  url: 'https://www.topps.com/pages/topps-chrome-disney',
  fields: [
    { name: '📅 Date / Method', value: 'Wed 6/17 — 12 PM EST | **EQL Release**', inline: false },
    { name: '💰 MSRP', value: '``$429.99``', inline: true },
    { name: '📦 Config', value: '12 packs × 6 cards | autographs', inline: true },
    { name: '🖊️ Auto Type', value: '``TBD — no CL/odds posted``', inline: false },
    { name: '📋 Checklist', value: 'Disney IP — character roster TBD. EQL suggests intentionally limited.', inline: false },
    { name: '📊 Historical', value: '``Disney Genesis (prior collab) = confirmed cook``\n``Disney Chrome = crossover collectors enter the market``', inline: false },
    { name: '📈 Target Sell-Through', value: '**Flip (<1 mo):** ``$550 – 700 | ~30 – 50 boxes``\n**Hold (3 mo):**  ``$600 – 750 | ~15 – 25 boxes``\n**Invest (1 yr):** ``$700 – 1,000+ | ~5 – 10 boxes``', inline: false },
    { name: '📊 eBay Sold Comps', value: `[Topps Chrome Disney — Sold Listings](${ebay('Topps Chrome Disney Hobby Box')})`, inline: false },
    { name: '⚠️ Verdict', value: '``EQL + Disney IP = entering blind is reasonable. Disney Genesis was a confirmed cook. Crossover collectors inflate demand beyond the normal hobby base. No CL is the only flag — enter the EQL.``', inline: false },
  ],
  footer: { text: 'Fiddler Research • Topps' },
}]);

// ─── 4. Chrome UWCL ───────────────────────────────────────────────────────────
await send([{
  color: GREEN,
  title: '🟢 2025-26 Topps Chrome UWCL ⚽',
  url: 'https://www.topps.com/pages/topps-chrome-uwcl',
  fields: [
    { name: '📅 Date / Method', value: 'Thurs 6/18 — 11 AM EST | FCFS', inline: false },
    { name: '💰 MSRP', value: '``$99.99``', inline: true },
    { name: '📦 Config', value: '20 packs × 4 cards | 2 autos per box', inline: true },
    { name: '📋 Checklist', value: 'UEFA Women\'s Champions League — niche but growing market', inline: false },
    { name: '⚡ Market Context', value: '``Best hit density per dollar of the week (2 autos at $100)``\n``UWCL avoids EPL fatigue — separate product line``\n``Women\'s soccer market not oversaturated``', inline: false },
    { name: '📈 Target Sell-Through', value: '**Flip (<1 mo):** ``$115 – 140 | ~50 – 80 boxes``\n**Hold (3 mo):**  ``$110 – 130 | ~25 – 40 boxes``\n**Invest (1 yr):** ``$110 – 150 | ~10 – 15 boxes``', inline: false },
    { name: '📊 eBay Sold Comps', value: `[Topps Chrome UWCL — Sold Listings](${ebay('Topps Chrome UWCL Hobby Box')})`, inline: false },
    { name: '⚠️ Verdict', value: '``Lowest cost + best hit density of the week. Lowest risk entry. Good for bulk. Don\'t hold long — women\'s soccer market still finding its footing.``', inline: false },
  ],
  footer: { text: 'Fiddler Research • Topps' },
}]);

// ─── 5. Inception Baseball ────────────────────────────────────────────────────
await send([{
  color: GREEN,
  title: '🟢 2025 Topps Inception Baseball ⚾',
  url: 'https://www.topps.com/pages/topps-inception-baseball',
  fields: [
    { name: '📅 Date / Method', value: 'Fri 6/19 — 11 AM EST | FCFS', inline: false },
    { name: '💰 MSRP', value: '``$249.99``', inline: true },
    { name: '📦 Config', value: '1 pack × 7 cards | 1 auto per box', inline: true },
    { name: '🖊️ Auto Type', value: '``On-Card (Inception signature format)``', inline: false },
    { name: '⚡ Market Context', value: '``On-card auto = +20-40% vs sticker on individual card sales``\n``1-pack format = intentionally limited print run``\n``Baseball market strong in 2026 — Chrome, Finest, Platinum all performing``', inline: false },
    { name: '📈 Target Sell-Through', value: '**Flip (<1 mo):** ``$300 – 340 | ~30 – 50 boxes``\n**Hold (3 mo):**  ``$310 – 360 | ~15 – 25 boxes``\n**Invest (1 yr):** ``$360 – 420 | ~10 – 15 boxes``', inline: false },
    { name: '📊 eBay Sold Comps', value: `[Topps Inception Baseball — Sold Listings](${ebay('2025 Topps Inception Baseball Hobby Box')})`, inline: false },
    { name: '⚠️ Verdict', value: '``On-card autos, clean 1-hit format, limited run. Baseball market cooperating. Steady 20-30% flip on MSRP, better if you pull the right name. Low drama, reliable.``', inline: false },
  ],
  footer: { text: 'Fiddler Research • Topps' },
}]);

// ─── 6. Cosmic Chrome Football ────────────────────────────────────────────────
await send([{
  color: GREEN,
  title: '🟢🟢 2025 Topps Cosmic Chrome Football 🏈',
  url: 'https://www.topps.com/pages/topps-cosmic-chrome-football',
  fields: [
    { name: '📅 Date / Method', value: 'Fri 6/19 — 12 PM EST | **EQL Release**', inline: false },
    { name: '💰 MSRP', value: '``$649.99``', inline: true },
    { name: '📦 Config', value: '20 packs × 4 cards | autographs + refractors', inline: true },
    { name: '🖊️ Auto Type', value: '``Chrome (Refractors + numbered parallels)``', inline: false },
    { name: '⚡ Market Context', value: '``Chrome Football = strongest demand category in the hobby``\n``Regular Chrome Football still ~$600 for 1-auto box``\n``EQL = bot-resistant, controlled allocation``\n``Ref: Chrome Black ($320 MSRP) held $300+ — Cosmic at $650 EQL holds much stronger``', inline: false },
    { name: '📈 Target Sell-Through', value: '**Flip (<1 mo):** ``$800 – 950 | ~40 – 60 boxes``\n**Hold (3 mo):**  ``$850 – 1,100 | ~20 – 35 boxes``\n**Invest (1 yr):** ``$1,000 – 1,400+ | ~10 – 20 boxes``', inline: false },
    { name: '📊 eBay Sold Comps', value: `[Cosmic Chrome Football — Sold Listings](${ebay('2025 Topps Cosmic Chrome Football Hobby Box')})`, inline: false },
    { name: '⚠️ Verdict', value: '``Chrome Football EQL is the safest big-money entry of the week. The category prints money. $650 is steep but you\'re not getting left holding the bag on Chrome Football. Enter every account. If you can get a case, lock it in.``', inline: false },
  ],
  footer: { text: 'Fiddler Research • Topps' },
}]);

// ─── 7. Chrome Cactus Jack Basketball ────────────────────────────────────────
await send([{
  color: GREEN,
  title: '🟢 2025-26 Topps Chrome Cactus Jack Basketball 🏀',
  url: 'https://www.topps.com/pages/topps-chrome-cactus-jack-basketball',
  fields: [
    { name: '📅 Date / Method', value: 'Fri 6/19 — 1 PM EST | **EQL Release**', inline: false },
    { name: '💰 MSRP', value: '``$499.99``', inline: true },
    { name: '📦 Config', value: '20 packs × 4 cards | limited refractors + autos', inline: true },
    { name: '🖊️ Auto Type', value: '``Chrome Refractor (on-card by Chrome format)``', inline: false },
    { name: '⚡ Market Context', value: '``IP collab = NBA collectors + Travis Scott / streetwear buyers``\n``Two buyer pools = demand above normal hobby baseline``\n``Cactus Jack brand = premium in sneakers/merch, carries over to cards``\n``EQL = hard cap on supply``', inline: false },
    { name: '📈 Target Sell-Through', value: '**Flip (<1 mo):** ``$650 – 800 | ~30 – 50 boxes``\n**Hold (3 mo):**  ``$700 – 900 | ~15 – 25 boxes``\n**Invest (1 yr):** ``$850 – 1,200+ | ~10 – 15 boxes``', inline: false },
    { name: '📊 eBay Sold Comps', value: `[Cactus Jack Basketball — Sold Listings](${ebay('Topps Chrome Cactus Jack Basketball Hobby Box')})`, inline: false },
    { name: '⚠️ Verdict', value: '``Highest ceiling of the week. Cactus Jack IP pulls in buyers who never touched a card box — same dynamic that made Disney Chrome and Marvel Chrome overperform. EQL keeps it clean. Risk: Travis Scott staying culturally relevant — that\'s been consistent. Strong buy.``', inline: false },
  ],
  footer: { text: 'Fiddler Research • Topps' },
}]);

console.log('\nAll messages sent.');
