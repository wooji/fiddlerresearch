const WEBHOOK = 'https://discord.com/api/webhooks/1516299027161944155/DbCEygRpwa0qrs38Otw4_UqeM7Zs5LE8waMQtO-KggcAhU1HeeSQhbBuxBWlcGhdkp31';
const DBLGREEN = 3066993;
const cdn = id => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_400x400.jpg`;
const ebay = q => 'https://www.ebay.com/sch/i.html?_nkw=' + encodeURIComponent(q) + '&LH_Sold=1&LH_Complete=1&_sacat=0&rt=nc';

const ETB_URL = ebay('Pokemon Ascended Heroes Elite Trainer Box');
const extra = (url, img) => ({ url, image: { url: img } });

// Live TCGPlayer data pulled 2026-06-16
// ETB Standard: market $176.44 | low $155 | high $202.49 | 25 sales
// ETB PC Exclusive: market $491.76
// Booster Bundle: market $105.96
// Retail confirmed: $59.99

const r = await fetch(WEBHOOK, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: '<@&728662538656677888>',
    embeds: [
      {
        color: DBLGREEN,
        title: '🟢🟢 Pokémon TCG — Ascended Heroes Elite Trainer Box (ME) ✅ CORRECTED',
        url: ETB_URL,
        description: '> 217-card Mega Evolution set | Mega starters + Gym Leaders | **Max this every time you see it**',
        thumbnail: { url: cdn(668496) },
        image:     { url: cdn(668497) },  // PC Exclusive ETB
        fields: [
          { name: '💰 Retail (Target/Walmart)', value: '`$59.99`',                         inline: true },
          { name: '📈 Market (TCGPlayer live)',  value: '`$176.44` *(as of 6/16/26)*',      inline: true },
          { name: '🔗 eBay Comps',               value: `[Sold Listings](${ETB_URL})`,      inline: true },
          { name: '📊 Market Range',             value: '`$155 low` — `$202 high` | 25 recent sales', inline: false },
          { name: '🏆 PC Exclusive ETB',         value: 'Market **`$491.76`** — if you can source the Pokemon Center variant, it\'s a monster flip on its own', inline: false },
          { name: '📦 Contents',                 value: '9 booster packs + sleeves, dice, coin, damage counters, storage box | 217-card set with Illustration Rares + Alt Arts', inline: false },
          { name: '🎯 Target Sell-Through',      value: '$155 – $190 | **~200 – 300+ units**', inline: true },
          { name: '📦 Bulk Buy Estimate',        value: '**200+ units** — max every account', inline: true },
          { name: '⚠️ Risk Level',               value: '🟢🟢 Very Low',                    inline: true },
          { name: '💵 Net Profit Est.',          value: '~`$93 – $110/unit` after eBay fees (13%) at market price. At $176 market: sell at $155 floor = still **$79/unit net**', inline: false },
          { name: '📝 Notes', value: "**This is a full-send play. 200+ units is the correct answer.** Retail $59.99. Market $176 with a $155 floor means even conservative sells net $79+/unit. PC Exclusive at $491 is borderline absurd — grab those separately if PCK drops. 217-card set with Mega starters (Charizard, Blastoise, Venusaur lines) + Gym Leaders hits every collector segment. Floor will hold as supply thins. Don't flip too early — hold buyers to $170+ range." },
        ],
        footer: { text: 'Fiddler Research | ME: Ascended Heroes — Live TCGPlayer data 6/16/26' },
      },
      extra(ETB_URL, cdn(672735)),  // Mega Feraligatr ex Box
      extra(ETB_URL, cdn(672733)),  // Mega Meganium ex Box
      extra(ETB_URL, cdn(672734)),  // Mega Emboar ex Box
    ],
  }),
});

if (!r.ok) console.error('FAIL', r.status, (await r.text()).slice(0, 200));
else console.log('SENT AH ETB corrected', r.status);
