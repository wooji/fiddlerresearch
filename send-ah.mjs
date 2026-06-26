const WEBHOOK = 'https://discord.com/api/webhooks/1516299027161944155/DbCEygRpwa0qrs38Otw4_UqeM7Zs5LE8waMQtO-KggcAhU1HeeSQhbBuxBWlcGhdkp31';
const GREEN    = 5763719;
const ORANGE   = 16747520;
const DBLGREEN = 3066993;

const ebay = q => 'https://www.ebay.com/sch/i.html?_nkw=' + encodeURIComponent(q) + '&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc';
const cdn  = id => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_400x400.jpg`;
const delay = ms => new Promise(res => setTimeout(res, ms));

async function send(embeds, content = '') {
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, embeds })
  });
  if (!r.ok) {
    const t = await r.text();
    console.error('ERROR', r.status, t.slice(0, 200));
  } else {
    console.log('SENT', r.status, embeds[0]?.title?.slice(0, 50));
  }
}

// Gallery pattern: extra embeds share the same url → Discord groups images
const extraImg = (sharedUrl, imgUrl) => ({ url: sharedUrl, image: { url: imgUrl } });

// ── 1. ASCENDED HEROES ETB ───────────────────────────────────────────────────
const ETB_URL = ebay('pokemon ascended heroes elite trainer box');
await send([
  {
    title: '🃏 Ascended Heroes — Elite Trainer Box',
    url: ETB_URL,
    color: GREEN,
    description: '**ME: Ascended Heroes** is the latest Mega Evolution set — 217 cards, Mega starters + legacy Gym Leaders. Both a standard ETB and a Pokémon Center exclusive ETB were released. High demand, limited shelf quantities at retail.',
    thumbnail: { url: cdn(668496) },
    image:     { url: cdn(668497) },   // PC Exclusive ETB
    fields: [
      { name: '💰 Retail Price',        value: '~$79.99 (Target)',               inline: true },
      { name: '📈 Market Value',         value: '$176.27 (TCGPlayer avg)',         inline: true },
      { name: '🔗 eBay Comps',           value: `[Sold Listings](${ETB_URL})`,    inline: true },
      { name: '🎯 Target Sell-Through',  value: '$150 – $175 | ~2 – 4 units',    inline: true },
      { name: '📦 Bulk Buy Estimate',    value: '2 – 4 units',                   inline: true },
      { name: '⚠️ Risk Level',           value: '🟡 Medium',                      inline: true },
      { name: '📝 Notes', value: 'PC Exclusive ETB trading at **$493** — worth noting if you can source it. Standard ETB has held above retail steadily. Great set with hit potential (Illustration Rares, Alt Arts). Watch for restock waves cooling price.' },
    ],
    footer: { text: 'Fiddler Research | ME: Ascended Heroes' },
  },
  extraImg(ETB_URL, cdn(672735)),  // Mega Feraligatr ex Box
  extraImg(ETB_URL, cdn(672733)),  // Mega Meganium ex Box
], '<@&728662538656677888>');

await delay(1400);

// ── 2. ASCENDED HEROES BOOSTER BUNDLE ────────────────────────────────────────
const BB_URL = ebay('pokemon ascended heroes booster bundle');
const BB_TARGET_IMG = 'https://target.scene7.com/is/image/Target/GUEST_9dd7cad1-8ab1-4245-a995-9849a72c1efa?wid=800&hei=800&qlt=80&fm';
await send([
  {
    title: '📦 Ascended Heroes — Booster Bundle',
    url: BB_URL,
    color: DBLGREEN,
    description: '6-pack bundle at a low entry price — strong for both flipping loose and as a buy-for-packs product. Market is well above retail with sustained demand.',
    thumbnail: { url: cdn(668541) },
    image:     { url: BB_TARGET_IMG },
    fields: [
      { name: '💰 Retail Price',        value: '$29.99 (Target confirmed)',       inline: true },
      { name: '📈 Market Value',         value: '$103.98 (TCGPlayer avg)',         inline: true },
      { name: '🔗 eBay Comps',           value: `[Sold Listings](${BB_URL})`,     inline: true },
      { name: '🎯 Target Sell-Through',  value: '$85 – $105 | ~4 – 8 units',     inline: true },
      { name: '📦 Bulk Buy Estimate',    value: '4 – 8 units',                   inline: true },
      { name: '⚠️ Risk Level',           value: '🟢 Low',                         inline: true },
      { name: '📝 Notes', value: 'Best value pick in the AH lineup. ~3.5x retail is exceptional for a bundle. Lower price point = quicker turnover. Buyers prefer these over singles packs for feel-good rips.' },
    ],
    footer: { text: 'Fiddler Research | ME: Ascended Heroes' },
  },
  extraImg(BB_URL, cdn(672734)),  // Mega Emboar ex Box
  extraImg(BB_URL, cdn(672434)),  // Booster Pack
], '');

await delay(1400);

// ── 3. CHARACTER COLLECTIONS (POSTER COLLECTIONS) ────────────────────────────
const COL_URL = ebay('pokemon ascended heroes collection erika larry');
await send([
  {
    title: '🎨 Ascended Heroes — Character Collections (Erika & Larry)',
    url: COL_URL,
    color: ORANGE,
    description: 'Character-themed collection boxes featuring Gym Leader promo cards, booster packs, and artwork. Erika and Larry variants. Slim resale margins — better as pulls than flips unless bought at deep discount.',
    thumbnail: { url: cdn(666906) },
    image:     { url: cdn(666907) },
    fields: [
      { name: '💰 Retail Price',        value: '~$19.99 – $24.99 each',          inline: true },
      { name: '📈 Market Value',         value: 'Erika $31.63 | Larry $30.68',    inline: true },
      { name: '🔗 eBay Comps',           value: `[Sold Listings](${COL_URL})`,    inline: true },
      { name: '🎯 Target Sell-Through',  value: '$26 – $32 | ~1 – 2 units each', inline: true },
      { name: '📦 Bulk Buy Estimate',    value: '1 – 2 units per variant',        inline: true },
      { name: '⚠️ Risk Level',           value: '🟠 Medium-High',                 inline: true },
      { name: '📝 Notes', value: 'Low margin (~$6-11/unit after fees). Buy only if you find these below $15. "Set of 2" bundle (Erika + Larry) also available — better perceived value. Erika slightly edges Larry in demand.' },
    ],
    footer: { text: 'Fiddler Research | ME: Ascended Heroes' },
  },
  extraImg(COL_URL, cdn(691923)),  // Set of 2 collection
], '');

await delay(1400);

// ── 4. MINI TIN DISPLAY ───────────────────────────────────────────────────────
const TIN_URL = ebay('pokemon ascended heroes mini tin display');
await send([
  {
    title: '🎰 Ascended Heroes — Mini Tin Display',
    url: TIN_URL,
    color: GREEN,
    description: 'Sealed retailer display unit containing multiple Ascended Heroes Mini Tins (Pikachu & Tepig + assorted variants). Niche product that commands strong market premiums when sealed. Individual mini tins sell for ~$29 each on TCGPlayer.',
    thumbnail: { url: cdn(679556) },
    image:     { url: cdn(672434) },  // Booster Pack (to show product art)
    fields: [
      { name: '💰 Retail Price',        value: '~$49.99 display (est.)',          inline: true },
      { name: '📈 Market Value',         value: '$315.77 sealed (TCGPlayer)',      inline: true },
      { name: '🔗 eBay Comps',           value: `[Sold Listings](${TIN_URL})`,    inline: true },
      { name: '🎯 Target Sell-Through',  value: '$250 – $320 | ~1 – 2 units',    inline: true },
      { name: '📦 Bulk Buy Estimate',    value: '1 – 2 displays',                 inline: true },
      { name: '⚠️ Risk Level',           value: '🟡 Medium',                      inline: true },
      { name: '📝 Notes', value: 'Very hard to find at retail. Individual mini tins ($29 market) break down profitably out of the display. Sealed display commands $315 — roughly 6x retail. Low volume but high upside if you can source one.' },
    ],
    footer: { text: 'Fiddler Research | ME: Ascended Heroes' },
  },
  extraImg(TIN_URL, cdn(668541)),  // BB as supplemental AH product photo
  extraImg(TIN_URL, cdn(668496)),  // ETB as supplemental
], '');

console.log('All 4 AH embeds sent.');
