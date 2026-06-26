const WEBHOOK = 'https://discord.com/api/webhooks/1516299027161944155/DbCEygRpwa0qrs38Otw4_UqeM7Zs5LE8waMQtO-KggcAhU1HeeSQhbBuxBWlcGhdkp31';
const GREEN = 5763719;

const ebay = q => 'https://www.ebay.com/sch/i.html?_nkw=' + encodeURIComponent(q) + '&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc';
const cdn  = id => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_400x400.jpg`;
const delay = ms => new Promise(res => setTimeout(res, ms));

const SAMS_IMG = 'https://scene7.samsclub.com/is/image/samsclub/prod_13590524234?wid=400&hei=400';
const HH_URL = ebay('Pokemon Ascended Heroes Heavy Hitters Collection');
const extra = (url, imgUrl) => ({ url, image: { url: imgUrl } });

const r = await fetch(WEBHOOK, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: '<@&728662538656677888>',
    embeds: [
      {
        color: GREEN,
        title: "🎯 Pokémon TCG — Ascended Heroes Heavy Hitters Collection (Sam's Club Exclusive)",
        url: HH_URL,
        description: "> **Sam's Club exclusive** | Drops **~7/21/26** | Item #`13590524234` | Add to List NOW to be ready on drop day",
        thumbnail: { url: SAMS_IMG },
        image:     { url: cdn(668496) },  // AH ETB for visual context
        fields: [
          { name: "💰 Sam's Club Price",  value: '`$54.98`',                         inline: true },
          { name: '📈 Resale Est.',        value: '`$100 – 135`',                     inline: true },
          { name: '🔗 eBay Comps',         value: `[Sold Listings](${HH_URL})`,       inline: true },
          { name: '🗓️ Drop Date',          value: "**~July 21, 2026** (Sam's Club instore + online) — stores getting 2-3 pallets; TN Sam's getting **10 pallets**", inline: false },
          { name: '📦 Contents (est.)',    value: '~14 Ascended Heroes booster packs + oversize promo foil card + foil promo cards + coin — based on Heavy Hitters brand precedent', inline: false },
          { name: '📊 Value Breakdown',    value: '14 packs × `$16.48` (TCGPlayer pack market) = **~$230 pack market value** at $55 retail — massive discount to market', inline: false },
          { name: '🎯 Target Sell-Through',value: '$100 – $135 | ~1 – 3 units',       inline: true },
          { name: '📦 Bulk Buy Estimate',  value: '1 – 3 units',                       inline: true },
          { name: "🏪 Sam's Club",         value: 'Membership required ($50/yr basic) — **limit 2 per member**', inline: false },
          { name: '⚠️ Risk Level',         value: '🟢 Low',                            inline: true },
          { name: '📝 Notes', value: "14 AH packs at $55 is borderline **below pack market cost** — the real play here is sealed bundle premium. AH ETB trades at $176 market (9 packs), so 14 packs in a bundle should floor well above $100. Tennessee Sam's getting 10 pallets vs usual 2-3 = heavy stock concentration. Online drop and in-store hit same day. Add to list NOW at samsclub.com/ip/13590524234 so you're notified the second it goes live." },
        ],
        footer: { text: "Fiddler Research | ME: Ascended Heroes — Sam's Club Exclusive" },
      },
      extra(HH_URL, cdn(668541)),  // AH BB
      extra(HH_URL, cdn(672434)),  // AH Booster Pack
    ],
  }),
});

if (!r.ok) console.error('FAIL', r.status, (await r.text()).slice(0, 200));
else console.log('OK: Heavy Hitters embed sent', r.status);
