const WEBHOOK_URL = 'https://discord.com/api/webhooks/1516299027161944155/DbCEygRpwa0qrs38Otw4_UqeM7Zs5LE8waMQtO-KggcAhU1HeeSQhbBuxBWlcGhdkp31';
const ebayUrl = 'https://www.ebay.com/sch/i.html?_nkw=hot+wheels+rlc+1962+ford+f100&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc';

// Colors: green=5763719, orange=16747520, red=16711680
const GREEN = 5763719;

const body = {
  content: '<@&1448090992094871715>',
  allowed_mentions: { roles: ['1448090992094871715'] },
  embeds: [{
    color: GREEN,
    title: "🟢 RLC Exclusive Teal Edition '62 Ford F100",
    url: 'https://creations.mattel.com/collections/rlc-exclusives',
    description: '> Page goes live today — swap URL when confirmed\n> 30-day Returns — You pay shipping',
    fields: [
      { name: '💰 Cost', value: '``$25 + tax``', inline: true },
      { name: '💰 Resale', value: '``$55 – 70``', inline: true },
      { name: '​', value: '​', inline: false },
      { name: '📦 Max Per Order', value: '``1 QTY``', inline: true },
      { name: '🏠 Household Limit', value: '``5 Orders``', inline: true },
      { name: '📦 Bulk Buy Est.', value: '``3 – 4 units``', inline: true },
      { name: '📈 Target Sell-Through', value: [
        '**Flip (<1 mo):** ``$55 – 70 | ~80 – 120 units``',
        '**Hold (3 mo):**  ``$45 – 55 | ~30 – 50 units``',
        '**Invest (1 yr):** ``$70 – 95 | ~10 – 20 units``',
      ].join('\n'), inline: false },
      { name: '🔑 RLC Account Required', value: '``YES``', inline: false },
      { name: '📊 eBay Sold Comps', value: `[RLC 1962 Ford F100 — Sold Listings](${ebayUrl})`, inline: false },
      { name: '⚠️ Caveats', value: "``The '62 F100 casting is RLC-only — no mainline, no pegs, no dilution. Every run they've dropped has held. Teal is not a color you see on diecast often, it pops hard in photos, and casual collectors buy with their eyes. Based on the Pink Edition F100 pattern ($30 in Sep 2023) and comparable releases like the Shelby Cobra and BRG Supra, expect launch-week presales to spike to $60–75, settle around $55 over month 1, then creep back past $70 within a year. Grab 3–4 accounts worth minimum. Clean, no-drama flip.``", inline: false },
    ],
    footer: { text: 'Fiddler Research • Mattel Creations / RLC' },
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
