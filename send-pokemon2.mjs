const WEBHOOK = 'https://discord.com/api/webhooks/1516299027161944155/DbCEygRpwa0qrs38Otw4_UqeM7Zs5LE8waMQtO-KggcAhU1HeeSQhbBuxBWlcGhdkp31';

const GREEN    = 5763719;
const DBLGREEN = 3066993;
const ORANGE   = 16747520;

const ebay = q => 'https://www.ebay.com/sch/i.html?_nkw=' + encodeURIComponent(q) + '&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc';
const cdn  = id => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_400x400.jpg`;
const delay = ms => new Promise(res => setTimeout(res, ms));

async function send(embeds, content = '') {
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, embeds }),
  });
  if (!r.ok) console.error('FAIL', r.status, (await r.text()).slice(0, 200));
  else console.log('OK:', embeds[0]?.title?.slice(0, 60));
  await delay(1400);
}

const extra = (url, imgUrl) => ({ url, image: { url: imgUrl } });

// ── IMAGE CONSTANTS ──────────────────────────────────────────────────────────
const WM_PE_ETB = 'https://i5.walmartimages.com/dfw/4ff9c6c9-e833/k2-_1a64f49d-a131-4963-b0f2-26fd127b44e1.v1.png';
const WM_PE_SPC = 'https://i5.walmartimages.com/seo/Pokemon-Scarlet-Violet-Prismatic-Evolutions-Super-Premium-Collection-Box_9c159f52-d8ee-48b7-a8f3-d419f7f35849.050b53790897c6f12848d8786cd39b6e.png';

// ── 1. PRISMATIC EVOLUTIONS ETB ───────────────────────────────────────────────
const PE_ETB_URL = ebay('Pokemon Prismatic Evolutions Elite Trainer Box');
await send([
  {
    color: GREEN,
    title: '🟢 Pokémon TCG — Prismatic Evolutions Elite Trainer Box (SV8a)',
    url: PE_ETB_URL,
    description: '> Eevee & all 8 Eeveelutions | Scarlet & Violet era | One of the best-selling Pokemon sets of all time',
    thumbnail: { url: WM_PE_ETB },
    image:     { url: WM_PE_ETB },
    fields: [
      { name: '💰 Retail (Walmart)',    value: '`$70.00`',                        inline: true },
      { name: '📈 Resale Market',       value: '`$150 – 170`',                    inline: true },
      { name: '🔗 eBay Comps',          value: `[Sold Listings](${PE_ETB_URL})`,  inline: true },
      { name: '📦 Contents',            value: '9 booster packs + sleeves, dice, coin, damage counters, storage box', inline: false },
      { name: '🎯 Target Sell-Through', value: '$150 – $170 | ~3 – 5 units',      inline: true },
      { name: '📦 Bulk Buy Estimate',   value: '3 – 5 units',                     inline: true },
      { name: '⚠️ Risk Level',          value: '🟡 Medium',                       inline: true },
      { name: '📝 Notes', value: 'Secondary market has cooled from $200+ launch peak to ~$150-170 after Walmart mass restocks. Floor keeps rising as supply depletes. Strong Eeveelution brand pulls both casual and competitive buyers. Buy every restock dip — long holds outperform quick flips at current prices.' },
    ],
    footer: { text: 'Fiddler Research | Pokémon TCG SV8a' },
  },
], '<@&728662538656677888>');

// ── 2. PRISMATIC EVOLUTIONS SPC ───────────────────────────────────────────────
const PE_SPC_URL = ebay('Pokemon Prismatic Evolutions Super Premium Collection');
await send([
  {
    color: DBLGREEN,
    title: '🟢🟢 Pokémon TCG — Prismatic Evolutions Super Premium Collection (SV8a)',
    url: PE_SPC_URL,
    description: '> Includes Eevee plush | Multiple promo cards | **Sam\'s Club dropping ~6,000 units on 7/21**',
    thumbnail: { url: WM_PE_SPC },
    image:     { url: WM_PE_SPC },
    fields: [
      { name: '💰 Retail (PCK/BestBuy)', value: '`~$79.99`',                     inline: true },
      { name: '📈 Resale Market',         value: '`$130 – 155`',                  inline: true },
      { name: '🔗 eBay Comps',            value: `[Sold Listings](${PE_SPC_URL})`,inline: true },
      { name: '📦 Contents',    value: '11-16 boosters + Eevee plush (~$35-50 resale alone) + promo cards + full ETB accessories', inline: false },
      { name: "🏪 Sam's Club Drop", value: '**~6,000 units expected 7/21** (or random morning drop) — 2 per account', inline: false },
      { name: '🎯 Target Sell-Through',   value: '$130 – $155 | ~2 – 4 units',    inline: true },
      { name: '📦 Bulk Buy Estimate',     value: '2 – 4 units',                   inline: true },
      { name: '⚠️ Risk Level',            value: '🟢 Low',                        inline: true },
      { name: '📝 Notes', value: "6,000 Sam's Club units is a confirmed volume drop — prep accounts now. Eevee plush strips ~$35-50 off effective cost, making the packs essentially free at retail. Hold tendency is strong: SPC supply far tighter than ETB and prices have held better through restocks. Full send on Sam's 7/21." },
    ],
    footer: { text: 'Fiddler Research | Pokémon TCG SV8a SPC' },
  },
], '');

// ── 3. CHAOS RISING ETB ───────────────────────────────────────────────────────
const CR_ETB_URL = ebay('Pokemon Chaos Rising Elite Trainer Box ME04');
await send([
  {
    color: ORANGE,
    title: '🟠 Pokémon TCG — Chaos Rising Elite Trainer Box (ME04)',
    url: CR_ETB_URL,
    description: '> Mega Evolution Series 4 | Target SKU `95267143` — stock <1,000 units | Market ~$77',
    thumbnail: { url: cdn(684456) },
    image:     { url: cdn(684457) },
    fields: [
      { name: '💰 Retail (Target)',     value: '`~$54.99`',                       inline: true },
      { name: '📈 TCGPlayer Market',    value: '`$77.46`',                        inline: true },
      { name: '🔗 eBay Comps',          value: `[Sold Listings](${CR_ETB_URL})`,  inline: true },
      { name: '🏪 Target Stock',        value: 'SKU `95267143` | **<1,000 units** in system — limited shelf life', inline: false },
      { name: '📦 Contents',            value: '9 booster packs + ETB accessories', inline: false },
      { name: '🎯 Target Sell-Through', value: '$65 – $80 | ~2 – 3 units',        inline: true },
      { name: '📦 Bulk Buy Estimate',   value: '2 – 3 units',                     inline: true },
      { name: '⚠️ Risk Level',          value: '🟠 Medium',                       inline: true },
      { name: '📝 Notes', value: 'Target stock sitting under 1K units — supply is tight compared to Chaos Rising BB (7K+). ~$22 margin at market. ME series print runs have been moderate; ETBs hold better than BBs. Don\'t sleep on this — low stock = faster price movement when it sells through.' },
    ],
    footer: { text: 'Fiddler Research | Pokémon TCG ME04' },
  },
  extra(CR_ETB_URL, cdn(684458)),
], '');

// ── 4. CHAOS RISING BOOSTER BUNDLE ────────────────────────────────────────────
const CR_BB_URL = ebay('Pokemon Chaos Rising Booster Bundle ME04');
await send([
  {
    color: ORANGE,
    title: '🟠 Pokémon TCG — Chaos Rising Booster Bundle (ME04)',
    url: CR_BB_URL,
    description: '> Mega Evolution Series 4 | Target SKU `95298172` — 7,000+ units stock | Volume play',
    thumbnail: { url: cdn(684456) },
    image:     { url: cdn(684458) },
    fields: [
      { name: '💰 Retail (Target)',     value: '`~$29.99`',                       inline: true },
      { name: '📈 Resale Est.',         value: '`$35 – 48`',                      inline: true },
      { name: '🔗 eBay Comps',          value: `[Sold Listings](${CR_BB_URL})`,   inline: true },
      { name: '🏪 Target Stock',        value: 'SKU `95298172` | 7,000+ units — wide availability, slower burn', inline: false },
      { name: '📦 Contents',            value: '4-5 booster packs (no accessories)', inline: false },
      { name: '🎯 Target Sell-Through', value: '$35 – $48 | ~3 – 5 units',        inline: true },
      { name: '📦 Bulk Buy Estimate',   value: '3 – 5 units',                     inline: true },
      { name: '⚠️ Risk Level',          value: '🟠 Medium-High',                  inline: true },
      { name: '📝 Notes', value: '7K+ units means this will take time to move. Slim margin ($5-18/unit). ETB (<1K stock) is the better play here. BBs are best suited for volume buyers who can move large quantities quickly. Move within 30 days or compete with heavy supply overhang.' },
    ],
    footer: { text: 'Fiddler Research | Pokémon TCG ME04 BB' },
  },
  extra(CR_BB_URL, cdn(684457)),
], '');

// ── 5. PITCH BLACK ETB ────────────────────────────────────────────────────────
const PB_ETB_URL = ebay('Pokemon Pitch Black Elite Trainer Box ME05');
await send([
  {
    color: GREEN,
    title: '🟢 Pokémon TCG — Pitch Black Elite Trainer Box (ME05)',
    url: PB_ETB_URL,
    description: '> Mega Evolution Series 5 | Darkrai IP | **Releases 7/17/26** | Target SKU `1011483406` · Limit 2 | Pre-order estimate: **$85+**',
    thumbnail: { url: cdn(692947) },
    image:     { url: cdn(692949) },  // PC Exclusive ETB
    fields: [
      { name: '💰 Retail (Target)',     value: '`$59.99` confirmed',              inline: true },
      { name: '📈 Market Est. (Release)',value: '`$85 – 100+`',                   inline: true },
      { name: '🔗 eBay Comps',          value: `[Sold Listings](${PB_ETB_URL})`,  inline: true },
      { name: '🗓️ Release Date',        value: '**July 17, 2026** — Pre-order NOW', inline: true },
      { name: '🏪 Target SKU',          value: 'Standard: `1011483406` | Pre-orders live', inline: true },
      { name: '📦 Contents',            value: '9 booster packs + ETB accessories | PC Exclusive ETB also available (higher market premium)', inline: false },
      { name: '🎯 Target Sell-Through', value: '$85 – $100 | ~2 – 3 units',       inline: true },
      { name: '📦 Bulk Buy Estimate',   value: '2 – 3 units',                     inline: true },
      { name: '⚠️ Risk Level',          value: '🟡 Medium',                       inline: true },
      { name: '📝 Notes', value: 'Darkrai is one of the most beloved Pokemon IPs — dark aesthetic, mythical rarity, nostalgia factor. Pre-order estimate $85+ on release from known resellers. Target limit 2 keeps supply constrained. PC Exclusive ETB will carry significant premium. Full send on pre-orders. Channel intel: **confirmed 3am EST Target drop on release date**.' },
    ],
    footer: { text: 'Fiddler Research | Pokémon TCG ME05 — Releases 7/17/26' },
  },
  extra(PB_ETB_URL, cdn(692942)),
  extra(PB_ETB_URL, cdn(692950)),
], '');

// ── 6. PITCH BLACK BOOSTER BUNDLE ─────────────────────────────────────────────
const PB_BB_URL = ebay('Pokemon Pitch Black Booster Bundle ME05');
await send([
  {
    color: GREEN,
    title: '🟢 Pokémon TCG — Pitch Black Booster Bundle (ME05)',
    url: PB_BB_URL,
    description: '> Mega Evolution Series 5 | **Releases 7/17/26** | Target SKU `1011483414` · Limit 2 | Best R/R of the ME05 lineup',
    thumbnail: { url: cdn(692942) },
    image:     { url: cdn(692947) },
    fields: [
      { name: '💰 Retail (Target)',     value: '`$29.99` confirmed',              inline: true },
      { name: '📈 Resale Est. (Release)',value: '`$45 – 65`',                     inline: true },
      { name: '🔗 eBay Comps',          value: `[Sold Listings](${PB_BB_URL})`,   inline: true },
      { name: '🗓️ Release Date',        value: '**July 17, 2026** — Pre-order NOW', inline: true },
      { name: '🏪 Target SKU',          value: 'Bundle: `1011483414` | Blister: `1011483408` | Display: `1011483413`', inline: false },
      { name: '📦 Contents',            value: '4-5 booster packs (no accessories) — lower entry, higher volume play', inline: false },
      { name: '🎯 Target Sell-Through', value: '$45 – $65 | ~4 – 6 units',        inline: true },
      { name: '📦 Bulk Buy Estimate',   value: '4 – 6 units',                     inline: true },
      { name: '⚠️ Risk Level',          value: '🟡 Medium',                       inline: true },
      { name: '📝 Notes', value: 'Best bang-for-buck in ME05. At $30 entry, Darkrai demand gives 50-100% margin potential. Also note: Booster Display (SKU `1011483413`) and 3-Pack Blister (`1011483408`) also in pre-order — grab the Display if you can source it (higher pack count, single purchase). Pre-order limit 10 on the BB per some reports.' },
    ],
    footer: { text: 'Fiddler Research | Pokémon TCG ME05 — Releases 7/17/26' },
  },
  extra(PB_BB_URL, cdn(692943)),
  extra(PB_BB_URL, cdn(692944)),
], '');

console.log('All 6 updated Pokemon embeds sent.');
