const WEBHOOK_URL = 'https://discord.com/api/webhooks/1516299027161944155/DbCEygRpwa0qrs38Otw4_UqeM7Zs5LE8waMQtO-KggcAhU1HeeSQhbBuxBWlcGhdkp31';

const GREEN     = 5763719;
const DBLGREEN  = 3066993;
const ORANGE    = 16747520;
const YELLOW    = 16705372;
const POKE_BLUE = 3447003;

function ebay(q) {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc`;
}

async function send(payload) {
  const r = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) console.error('FAIL', r.status, await r.text());
  else console.log('OK:', payload.embeds?.[0]?.title?.slice(0, 60));
  await new Promise(res => setTimeout(res, 1500));
}

// ─── IMAGES ───────────────────────────────────────────────────────────────────
const IMGS = {
  PE_ETB:   'https://i5.walmartimages.com/dfw/4ff9c6c9-e833/k2-_1a64f49d-a131-4963-b0f2-26fd127b44e1.v1.png',
  PE_SPC:   'https://i5.walmartimages.com/seo/Pokemon-Scarlet-Violet-Prismatic-Evolutions-Super-Premium-Collection-Box_9c159f52-d8ee-48b7-a8f3-d419f7f35849.050b53790897c6f12848d8786cd39b6e.png',
  CHAOS:    'https://tcgplayer-cdn.tcgplayer.com/product/684456_in_200x200.jpg',
  PITCH:    'https://tcgplayer-cdn.tcgplayer.com/product/692942_in_200x200.jpg',
};

// ─── 1. Prismatic Evolutions ETB ──────────────────────────────────────────────
await send({
  embeds: [{
    color: GREEN,
    title: '🟢 Pokémon TCG — Prismatic Evolutions Elite Trainer Box (SV8a)',
    url: 'https://www.walmart.com/ip/13816151308',
    description: '> Eevee & all 8 Eeveelutions | Scarlet & Violet Series | High demand set',
    thumbnail: { url: IMGS.PE_ETB },
    image: { url: IMGS.PE_ETB },
    fields: [
      { name: '💰 Retail (Walmart)', value: '``$70.00``', inline: true },
      { name: '💰 Resale Now', value: '``$150 – 170``', inline: true },
      { name: '📦 Contents', value: '9 booster packs + card sleeves, damage counters, coin, dice, storage box', inline: false },
      { name: '📦 Max Per Order', value: '``5``', inline: true },
      { name: '📦 Est. Stock (Walmart)', value: '``<1,000 online``', inline: true },
      { name: '📈 Target Sell-Through', value: [
        '**Flip (<1 mo):** ``$150 – 170 | ~200 – 350 units``',
        '**Hold (3 mo):**  ``$120 – 145 | ~100 – 150 units``',
        '**Invest (1 yr):** ``$100 – 130 | ~30 – 50 units``',
      ].join('\n'), inline: false },
      { name: '📊 eBay Sold Comps', value: `[Prismatic Evolutions ETB — Sold Listings](${ebay('Pokemon Prismatic Evolutions Elite Trainer Box')})`, inline: false },
      { name: '⚠️ Caveats', value: "``One of the hottest Pokemon TCG sets in years. Eevee + all Eeveelutions hit every collector demographic. Secondary was $200+ at launch, has cooled to $150-170 after Walmart mass drops — but the floor keeps rising as stock depletes. Buy the dip on every restock. Long term hold plays better than flip at these prices.``", inline: false },
    ],
    footer: { text: 'Fiddler Research • Pokémon TCG / SV8a' },
  }],
});

// ─── 2. Prismatic Evolutions SPC ─────────────────────────────────────────────
await send({
  embeds: [{
    color: DBLGREEN,
    title: '🟢🟢 Pokémon TCG — Prismatic Evolutions Super Premium Collection',
    url: 'https://www.pokemon.com/us/pokemon-tcg/product-catalog/scarlet-violet-prismatic-evolutions',
    description: '> Includes Eevee plush | Multiple promo cards | Sam\'s Club & BestBuy confirmed drops',
    thumbnail: { url: IMGS.PE_SPC },
    image: { url: IMGS.PE_SPC },
    fields: [
      { name: '💰 Retail (PCK/BestBuy)', value: '``~$79.99``', inline: true },
      { name: '💰 Resale', value: '``$130 – 150``', inline: true },
      { name: '💰 Sam\'s Club Est.', value: '``TBD (likely $69.99–79.99)``', inline: true },
      { name: '📦 Contents', value: '11-16 booster packs + Eevee plush + promo cards + full ETB accessories', inline: false },
      { name: '📦 Max Per Order (Sam\'s)', value: '``2 units``', inline: true },
      { name: '🏠 Membership Required', value: '``Sam\'s Plus ($120/yr)``', inline: true },
      { name: '📈 Target Sell-Through', value: [
        '**Flip (<1 mo):** ``$130 – 150 | ~50 – 80 units``',
        '**Hold (3 mo):**  ``$140 – 165 | ~25 – 40 units``',
        '**Invest (1 yr):** ``$160 – 210 | ~10 – 20 units``',
      ].join('\n'), inline: false },
      { name: '📊 eBay Sold Comps', value: `[Prismatic Evolutions SPC — Sold Listings](${ebay('Pokemon Prismatic Evolutions Super Premium Collection')})`, inline: false },
      { name: '⚠️ Caveats', value: "``The Eevee plush alone sells for $35-50 on secondary. Subtract that from cost and you're getting SV8a packs at massive discount. Sam's Club drops are the cheapest SPC you'll find — full send every account you have on that drop. BestBuy drops go live sporadically; set up monitors. Hold tendency is strong here: SPC supply is far tighter than ETB.``", inline: false },
    ],
    footer: { text: 'Fiddler Research • Pokémon TCG / SV8a SPC' },
  }],
});

// ─── 3. Chaos Rising ETB ─────────────────────────────────────────────────────
await send({
  embeds: [{
    color: ORANGE,
    title: '🟠 Pokémon TCG — Chaos Rising Elite Trainer Box (ME04)',
    url: 'https://www.pokemoncenter.com/en-us/product/10-10399-101',
    description: '> Mega Evolution Series set 4 | Pokemon Center exclusive drop | SKU: 10-10399-101',
    thumbnail: { url: IMGS.CHAOS },
    fields: [
      { name: '💰 Retail (PCK)', value: '``~$49.99 – 55.00``', inline: true },
      { name: '💰 TCGPlayer Market', value: '``~$41.99``', inline: true },
      { name: '📦 Contents', value: 'Standard ETB: 9 booster packs + accessories', inline: false },
      { name: '📦 Max Per Order (PCK)', value: '``2 units``', inline: true },
      { name: '🏠 PKC Account Required', value: '``YES``', inline: true },
      { name: '⚡ Market Context', value: [
        '``ME series (Mega Evolution) = Ascended Heroes, Chaos Rising, Pitch Black``',
        '``Ascended Heroes BB had 50K+ units at Target — big print run for ME series``',
        '``Pokemon Center exclusive ETBs typically tighter supply than retail drops``',
        '``Mega Evolution Pokemon are beloved by Gen 1-2 collectors``',
      ].join('\n'), inline: false },
      { name: '📈 Target Sell-Through', value: [
        '**Flip (<1 mo):** ``$55 – 75 | ~80 – 120 units``',
        '**Hold (3 mo):**  ``$60 – 80 | ~40 – 60 units``',
        '**Invest (1 yr):** ``$70 – 100 | ~15 – 25 units``',
      ].join('\n'), inline: false },
      { name: '📊 eBay Sold Comps', value: `[Chaos Rising ETB — Sold Listings](${ebay('Pokemon Chaos Rising Elite Trainer Box ME04')})`, inline: false },
      { name: '⚠️ Caveats', value: "``Cautious on margin — ME series has had big print runs at retail. Pokemon Center exclusive ETBs hold better than mass-market drops due to purchase limits. If the Chaos Rising checklist features popular Mega Evolution Pokemon (Mewtwo, Charizard, Rayquaza tier), this flips fast. Check checklist on drop day before going deep.``", inline: false },
    ],
    footer: { text: 'Fiddler Research • Pokémon TCG / ME04' },
  }],
});

// ─── 4. Chaos Rising Booster Bundle ──────────────────────────────────────────
await send({
  embeds: [{
    color: ORANGE,
    title: '🟠 Pokémon TCG — Chaos Rising Booster Bundle (ME04)',
    url: 'https://www.pokemoncenter.com/en-us/product/10-10403-109',
    description: '> Mega Evolution Series set 4 | Lower entry, higher volume play | SKU: 10-10403-109',
    thumbnail: { url: IMGS.CHAOS },
    fields: [
      { name: '💰 Retail (PCK)', value: '``~$25.00 – 30.00``', inline: true },
      { name: '💰 Resale Est.', value: '``$30 – 45``', inline: true },
      { name: '📦 Contents', value: 'Booster Bundle: 4-5 booster packs (no accessories)', inline: false },
      { name: '📦 Max Per Order', value: '``2 – 5 units``', inline: true },
      { name: '📦 Bulk Est.', value: '``4 – 8 units``', inline: true },
      { name: '⚡ Market Context', value: [
        '``Reference: Perfect Order BB $30 retail → $40+ resell``',
        '``Ascended Heroes BB $30 retail → 50K+ stock, slim margins``',
        '``BB plays are volume-dependent — low margin per unit, needs scale``',
        '``Better for buyers with multiple accounts at lower risk``',
      ].join('\n'), inline: false },
      { name: '📈 Target Sell-Through', value: [
        '**Flip (<1 mo):** ``$32 – 45 | ~150 – 250 units``',
        '**Hold (3 mo):**  ``$35 – 48 | ~60 – 90 units``',
        '**Invest (1 yr):** ``$40 – 60 | ~20 – 35 units``',
      ].join('\n'), inline: false },
      { name: '📊 eBay Sold Comps', value: `[Chaos Rising Booster Bundle — Sold Listings](${ebay('Pokemon Chaos Rising Booster Bundle')})`, inline: false },
      { name: '⚠️ Caveats', value: "``Slim margins on BBs. This play is about volume — 4-8 units per drop, move fast in the first 2-3 weeks. If you're sitting on these after month 2, you're competing with every other seller who bulk-bought. Check if this is Pokemon Center exclusive or retail — PCK exclusives hold better due to purchase limits.``", inline: false },
    ],
    footer: { text: 'Fiddler Research • Pokémon TCG / ME04 BB' },
  }],
});

// ─── 5. Pitch Black ETB ──────────────────────────────────────────────────────
await send({
  embeds: [{
    color: GREEN,
    title: '🟢 Pokémon TCG — Pitch Black Elite Trainer Box (ME05)',
    url: 'https://www.tcgplayer.com/search/pokemon/product?q=pitch+black',
    description: '> Mega Evolution Series set 5 | Darkrai IP — strong demand signal | ME05',
    thumbnail: { url: IMGS.PITCH },
    fields: [
      { name: '💰 Retail (PCK)', value: '``~$49.99 – 55.00``', inline: true },
      { name: '💰 TCGPlayer Market', value: '``~$55.99``', inline: true },
      { name: '📦 Contents', value: 'Standard ETB: 9 booster packs + accessories', inline: false },
      { name: '📦 Max Per Order (PCK)', value: '``2 units``', inline: true },
      { name: '🏠 PKC Account Required', value: '``YES``', inline: true },
      { name: '⚡ Market Context', value: [
        '``Darkrai IP: analyst confirmed "this set will do well just because it has Darkrai in it"``',
        '``TCGPlayer market already at $55.99 — trading AT or ABOVE MSRP pre-drop``',
        '``ME05 is newer than ME04; less supply in the market currently``',
        '``Darkness/villain aesthetics = strong resale with casual + competitive buyers``',
        '``New Mega Darkrai ex set confirmed coming July 2026 — amplifies interest``',
      ].join('\n'), inline: false },
      { name: '📈 Target Sell-Through', value: [
        '**Flip (<1 mo):** ``$65 – 90 | ~60 – 100 units``',
        '**Hold (3 mo):**  ``$70 – 95 | ~30 – 50 units``',
        '**Invest (1 yr):** ``$85 – 120 | ~15 – 25 units``',
      ].join('\n'), inline: false },
      { name: '📊 eBay Sold Comps', value: `[Pitch Black ETB — Sold Listings](${ebay('Pokemon Pitch Black Elite Trainer Box ME05')})`, inline: false },
      { name: '⚠️ Caveats', value: "``Darkrai moves product. Period. With a Mega Darkrai ex set confirmed for July 2026, every piece of Darkrai-adjacent content gets a halo lift. TCGPlayer market price already above MSRP is the clearest buy signal of the ME series. Don't overthink it — grab all 2 units per account.``", inline: false },
    ],
    footer: { text: 'Fiddler Research • Pokémon TCG / ME05' },
  }],
});

// ─── 6. Pitch Black Booster Bundle ───────────────────────────────────────────
await send({
  embeds: [{
    color: GREEN,
    title: '🟢 Pokémon TCG — Pitch Black Booster Bundle (ME05)',
    url: 'https://www.tcgplayer.com/search/pokemon/product?q=pitch+black+booster+bundle',
    description: '> Mega Evolution Series set 5 | Low-cost Darkrai entry | Best risk/reward of ME05 SKUs',
    thumbnail: { url: IMGS.PITCH },
    fields: [
      { name: '💰 Retail (PCK)', value: '``~$25.00 – 30.00``', inline: true },
      { name: '💰 Resale Est.', value: '``$35 – 55``', inline: true },
      { name: '📦 Contents', value: 'Booster Bundle: 4-5 booster packs', inline: false },
      { name: '📦 Max Per Order', value: '``2 – 5 units``', inline: true },
      { name: '📦 Bulk Est.', value: '``6 – 10 units``', inline: true },
      { name: '⚡ Market Context', value: [
        '``Lower price = lower risk = better bulk play vs. ETB``',
        '``Darkrai demand lifts ALL ME05 SKUs — BBs benefit from the same hype``',
        '``Better per-dollar value than ETB for bulk resellers``',
        '``Reference: Black Bolt Sticker Collection $16 retail → $30 resell (88% margin)``',
      ].join('\n'), inline: false },
      { name: '📈 Target Sell-Through', value: [
        '**Flip (<1 mo):** ``$35 – 55 | ~200 – 350 units``',
        '**Hold (3 mo):**  ``$38 – 58 | ~80 – 120 units``',
        '**Invest (1 yr):** ``$45 – 70 | ~25 – 40 units``',
      ].join('\n'), inline: false },
      { name: '📊 eBay Sold Comps', value: `[Pitch Black Booster Bundle — Sold Listings](${ebay('Pokemon Pitch Black Booster Bundle ME05')})`, inline: false },
      { name: '⚠️ Caveats', value: "``Best R/R of the ME05 SKUs. At $25-30, even a modest Darkrai bump gets you 40-80% margin. Volume play — stack 6-10 units across accounts and move them in the first 30 days. Don't hold past month 2 unless you have a confirmed hold buyer. Move faster than the PE ETB crowd — BBs are lower margin and timing matters more.``", inline: false },
    ],
    footer: { text: 'Fiddler Research • Pokémon TCG / ME05 BB' },
  }],
});

console.log('\nAll 6 Pokemon embeds sent.');
