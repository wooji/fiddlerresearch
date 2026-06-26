const WEBHOOK_URL = 'https://discord.com/api/webhooks/1516299027161944155/DbCEygRpwa0qrs38Otw4_UqeM7Zs5LE8waMQtO-KggcAhU1HeeSQhbBuxBWlcGhdkp31';
const ebayUrl = 'https://www.ebay.com/sch/i.html?_nkw=monster+high+skullector+alien&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc';

// Colors: green=5763719, orange=16747520, red=16711680
const GREEN = 5763719;

const body = {
  content: '<@&1448090992094871715>',
  allowed_mentions: { roles: ['1448090992094871715'] },
  embeds: [{
    color: GREEN,
    title: '🟢 Monster High Skullector Alien (Xenomorph) Doll',
    url: 'https://creations.mattel.com/products/monster-high-skullector-alien-doll-jdr69',
    description: '> SKU: JDR69 | Scary Season 2025 | Alien: Earth (FX/Hulu) tie-in\n> 30-day Returns — You pay shipping',
    fields: [
      { name: '💰 Cost', value: '``$85.00 + tax``', inline: true },
      { name: '💰 Resale', value: '``$150 – 185``', inline: true },
      { name: '​', value: '​', inline: false },
      { name: '📦 Max Per Order', value: '``2 units``', inline: true },
      { name: '🏠 Household Limit', value: '``5 Orders``', inline: true },
      { name: '📦 Bulk Buy Est.', value: '``6 – 8 units``', inline: true },
      { name: '📈 Target Sell-Through', value: [
        '**Flip (<1 mo):** ``$150 – 185 | ~15 – 25 units``',
        '**Hold (3 mo):**  ``$160 – 200 | ~8 – 12 units``',
        '**Invest (1 yr):** ``$180 – 250+ | ~3 – 6 units``',
      ].join('\n'), inline: false },
      { name: '🔑 Account Required', value: '``YES — Mattel Creations``', inline: false },
      { name: '📊 eBay Sold Comps', value: `[Skullector Alien — Sold Listings](${ebayUrl})`, inline: false },
      { name: '📋 Skullector Comp History', value: [
        '``Scarah Screams $85 → $150 launch → $130 now``',
        '``Coraline $71 → $100–130``',
        '``Beetlejuice/Lydia $98 → $130–160``',
        '``Boo-riginals 2024 $25 retail → $100 secondary``',
      ].join('\n'), inline: false },
      { name: '⚠️ Caveats', value: "``Highest-priced single Skullector ever at $85. Alien is the strongest IP they've done — franchise fans, sci-fi collectors, and MH collectors are all buying. Alien: Earth on FX is active now, rare timing. Discord flagged Xenomorph as best casting quality of any Skullector drop. Already backordered = confirmed limited stock. Margin 75–120%. Best Skullector of the year — clean buy.``", inline: false },
    ],
    footer: { text: 'Fiddler Research • Mattel Creations' },
  }],
};

const r = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

console.log('Status:', r.status);
if (!r.ok) console.log(await r.text());
else console.log('Sent OK');
