#!/usr/bin/env node
// Autonomous JP Pokemon enrichment loop.
// For every JP set in set-history-pokemon-jp.json:
//   1. Derive top chase cards from fullCardList
//   2. Compute sealed market from products{}
//   3. Map to EN set counterpart (set-history.json name match)
//   4. Write enriched record back — chaseCards[], sealedMarket, enSetKey, enSetName, multiple
// Runs sequentially (no external scraping needed — all data already in TCGCSV DB).
// Re-run anytime to refresh after tcgcsv-csv-fetcher refresh.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const JP_PATH = join(ROOT, 'set-history-pokemon-jp.json');
const EN_PATH = join(ROOT, 'set-history.json');

const jpDb = JSON.parse(readFileSync(JP_PATH, 'utf8'));
const enDb = JSON.parse(readFileSync(EN_PATH, 'utf8'));

const jpSets = jpDb.sets ?? jpDb;
const enSets = enDb.sets ?? enDb;

// Build EN lookup by normalized name
function norm(s) { return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

const enByNorm = {};
for (const [k, v] of Object.entries(enSets)) {
  const n = norm(v.set_name ?? v.name ?? k);
  enByNorm[n] = { key: k, ...v };
}

// JP→EN set name mappings (known translations)
const JP_TO_EN = {
  // SV1
  'scarletex':              'sv1s-scarlet-ex',
  'violetex':               'sv1v-violet-ex',
  'sv1s':                   'sv1s-scarlet-ex',
  'sv1v':                   'sv1v-violet-ex',
  // SV1a (Triplet Beat → Paldea Evolved)
  'tripletbeat':            'sv02-paldea-evolved',
  'sv1a':                   'sv02-paldea-evolved',
  // SV2 (Snow Hazard/Clay Burst → Paldea Evolved)
  'snowhazard':             'sv02-paldea-evolved',
  'clayburst':              'sv02-paldea-evolved',
  'sv2p':                   'sv02-paldea-evolved',
  'sv2d':                   'sv02-paldea-evolved',
  // SV2a (151)
  'pokemoncardgame151':     'sv-pokemon-card-151',
  'sv2a':                   'sv-pokemon-card-151',
  // SV3 (Ruler of Black Flame → Obsidian Flames)
  'ruleroftheblackflame':   'sv03-obsidian-flames',
  'sv3':                    'sv03-obsidian-flames',
  // SV3a (Raging Surf → Paradox Rift)
  'ragingsurf':             'sv04-paradox-rift',
  'sv3a':                   'sv04-paradox-rift',
  // SV4 (Ancient Roar/Future Flash → Paradox Rift)
  'ancientroar':            'sv04-paradox-rift',
  'futureflash':            'sv04-paradox-rift',
  'sv4k':                   'sv04-paradox-rift',
  'sv4m':                   'sv04-paradox-rift',
  // SV4a (Shiny Treasure ex → Paldean Fates)
  'shinytreasureex':        'sv-paldean-fates',
  'sv4a':                   'sv-paldean-fates',
  // SV5 (Wild Force/Cyber Judge → Temporal Forces)
  'wildforce':              'sv05-temporal-forces',
  'cyberjudge':             'sv05-temporal-forces',
  'sv5k':                   'sv05-temporal-forces',
  'sv5m':                   'sv05-temporal-forces',
  // SV5a (Crimson Haze → Twilight Masquerade)
  'crimsonhaze':            'sv06-twilight-masquerade',
  'sv5a':                   'sv06-twilight-masquerade',
  // SV6 (Transformation Mask → Twilight Masquerade)
  'transformationmask':     'sv06-twilight-masquerade',
  'maskofchange':           'sv06-twilight-masquerade',
  'sv6':                    'sv06-twilight-masquerade',
  // SV6a (Night Wanderer → Shrouded Fable)
  'nightwanderer':          'sv-shrouded-fable',
  'sv6a':                   'sv-shrouded-fable',
  // SV7 (Stellar Miracle → Stellar Crown)
  'stellarmiracle':         'sv07-stellar-crown',
  'sv7':                    'sv07-stellar-crown',
  // SV7a (Paradise Dragona → Stellar Crown)
  'paradisedragona':        'sv07-stellar-crown',
  'sv7a':                   'sv07-stellar-crown',
  // SV8 (Super Electric Breaker → Surging Sparks)
  'superelectricbreaker':   'sv08-surging-sparks',
  'sv8':                    'sv08-surging-sparks',
  // SV8a (Terastal Fest ex → Prismatic Evolutions)
  'terastalfesteex':        'sv-prismatic-evolutions',
  'terastalfestex':         'sv-prismatic-evolutions',
  'sv8a':                   'sv-prismatic-evolutions',
  // SV9 (Battle Partners → Journey Together)
  'battlepartners':         'sv09-journey-together',
  'sv9':                    'sv09-journey-together',
  // SV9a (Heat Wave Arena → Journey Together)
  'heatwavearena':          'sv09-journey-together',
  'sv9a':                   'sv09-journey-together',
  // SV10 (Glory of Team Rocket → Destined Rivals)
  'gloryofteamrocket':      'sv10-destined-rivals',
  'sv10':                   'sv10-destined-rivals',
  // SV11 physical TCG: no EN release yet — intentionally unmapped
  // DO NOT map sv11b/sv11w here; sv-black-bolt/sv-white-flare are Pocket sets, not physical TCG

  // Pokemon TCG Pocket JP→EN — use name-based frags ONLY (no short key prefixes — they false-match SM4/SM5 era)
  // m1l (Mega Brave) + m1s (Mega Symphonia) = Genetic Apex JP → me01-mega-evolution EN
  'megabrave':              'me01-mega-evolution',
  'megasymphonia':          'me01-mega-evolution',
  // m2 (Inferno-X) → me02-phantasmal-flames EN (same top card: Mega Charizard X ex)
  'infernox':               'me02-phantasmal-flames',
  // m2a (High Class Pack / Mega Dream Ex) → me-ascended-heroes EN (same top: Mega Gengar ex, large compilation)
  'megadreamex':            'me-ascended-heroes',
  'highdreamex':            'me-ascended-heroes',
  // m3 (Nihil Zero) → me03-perfect-order EN (118 vs 123 cards)
  'nihilzero':              'me03-perfect-order',
  // m4 (Ninja Spinner) → me04-chaos-rising EN (same top: Mega Greninja ex, 120 vs 122 cards)
  'ninjaspinner':           'me04-chaos-rising',
  // m5 (Abyss Eye) → sv-black-bolt EN "Pitch Black" (user confirmed: アビスアイ = Pitch Black)
  'abysseye':               'sv-black-bolt',
  // mbg/mbd (Mega Starter Sets) → me-mega-evolution-promo EN
  'megagengarex':           'me-mega-evolution-promo',
  'megadiancie':            'me-mega-evolution-promo',
  // Mega-era starters → removed incorrect sv09 mappings (m3/m4/m5 Pocket sets now correctly mapped above)

  // SWSH era (S-series JP)
  // S1 (Sword/Shield base)
  's1w':                    'swsh01-sword-shield-base-set',
  's1h':                    'swsh01-sword-shield-base-set',
  'sword':                  'swsh01-sword-shield-base-set',
  'shield':                 'swsh01-sword-shield-base-set',
  // S1a (VMAX Rising → Rebel Clash era)
  's1a':                    'swsh02-rebel-clash',
  'vmaxrising':             'swsh02-rebel-clash',
  // S2 (Rebellion Crash → Rebel Clash)
  's2':                     'swsh02-rebel-clash',
  'rebellioncrash':         'swsh02-rebel-clash',
  // S2a (Explosive Walker → Darkness Ablaze)
  's2a':                    'swsh03-darkness-ablaze',
  'explosivewalker':        'swsh03-darkness-ablaze',
  // S3 (Infinity Zone → Darkness Ablaze)
  's3':                     'swsh03-darkness-ablaze',
  'infinityzone':           'swsh03-darkness-ablaze',
  // S3a (Legendary Heartbeat → Vivid Voltage)
  's3a':                    'swsh04-vivid-voltage',
  'legendaryheartbeat':     'swsh04-vivid-voltage',
  // S4 (Amazing Volt Tackle → Vivid Voltage)
  's4':                     'swsh04-vivid-voltage',
  'amazingvolttackle':      'swsh04-vivid-voltage',
  // S4a (Shiny Star V → no exact EN; closest = Shining Fates)
  's4a':                    'swsh045-shining-fates',
  'shinystarv':             'swsh045-shining-fates',
  // S5 (Single Strike/Rapid Strike Masters → Battle Styles)
  's5i':                    'swsh05-battle-styles',
  's5r':                    'swsh05-battle-styles',
  'singlestrikemaster':     'swsh05-battle-styles',
  'rapidstrikemaster':      'swsh05-battle-styles',
  // S5a (Peerless Fighters → Chilling Reign)
  's5a':                    'swsh06-chilling-reign',
  'peerlessfighters':       'swsh06-chilling-reign',
  // S6 (Silver Lance/Jet-Black Spirit → Chilling Reign)
  's6h':                    'swsh06-chilling-reign',
  's6k':                    'swsh06-chilling-reign',
  'silverlance':            'swsh06-chilling-reign',
  'jetblackspirit':         'swsh06-chilling-reign',
  // S6a (Eevee Heroes → Evolving Skies)
  's6a':                    'swsh07-evolving-skies',
  'eeveheroes':             'swsh07-evolving-skies',
  'eeveeheroes':            'swsh07-evolving-skies',
  // S7 (Blue Sky Stream/Skyscraping Perfection → Evolving Skies)
  's7r':                    'swsh07-evolving-skies',
  's7d':                    'swsh07-evolving-skies',
  'blueskystream':          'swsh07-evolving-skies',
  'skyscrapingperfection':  'swsh07-evolving-skies',
  // S8 (Fusion Arts → Fusion Strike)
  's8':                     'swsh08-fusion-strike',
  'fusionarts':             'swsh08-fusion-strike',
  // S8b (VMAX Climax → Crown Zenith Galarian Gallery)
  's8b':                    'swsh-crown-zenith-galarian-gallery',
  'vmaxclimax':             'swsh-crown-zenith-galarian-gallery',
  // S9 (Star Birth → Brilliant Stars)
  's9':                     'swsh09-brilliant-stars',
  'starbirth':              'swsh09-brilliant-stars',
  // S9a (Battle Region → Astral Radiance)
  's9a':                    'swsh10-astral-radiance',
  'battleregion':           'swsh10-astral-radiance',
  // S10 (Time Gazer/Space Juggler → Astral Radiance)
  's10d':                   'swsh10-astral-radiance',
  's10p':                   'swsh10-astral-radiance',
  'timegazer':              'swsh10-astral-radiance',
  'spacejuggler':           'swsh10-astral-radiance',
  // S10a (Dark Phantasma → Lost Origin)
  's10a':                   'swsh11-lost-origin',
  'darkphantasma':          'swsh11-lost-origin',
  // S10b (Pokemon GO → Astral Radiance approximate)
  's10b':                   'swsh10-astral-radiance',
  'pokemongo':              'swsh10-astral-radiance',
  // S11 (Lost Abyss → Lost Origin)
  's11':                    'swsh11-lost-origin',
  'lostabyss':              'swsh11-lost-origin',
  // S11a (Incandescent Arcana → Silver Tempest)
  's11a':                   'swsh12-silver-tempest',
  'incandescentarcana':     'swsh12-silver-tempest',
  // S12 (Paradigm Trigger → Silver Tempest)
  's12':                    'swsh12-silver-tempest',
  'paradigmtrigger':        'swsh12-silver-tempest',
  // S12a (VSTAR Universe → Crown Zenith)
  's12a':                   'swsh-crown-zenith',
  'vstaruniverse':          'swsh-crown-zenith',

  // SM era (SM1–SM12a)
  'sm1s':                   'sm-base-set',
  'sm1m':                   'sm-base-set',
  'collectionsun':          'sm-base-set',
  'collectionmoon':         'sm-base-set',
  'sm2k':                   'sm-guardians-rising',
  'sm2l':                   'sm-guardians-rising',
  'islandsawait':           'sm-guardians-rising',
  'alolanmoonlight':        'sm-guardians-rising',
  'sm3':                    'shining-legends',
  'shininglegendsj':        'shining-legends',
  'sm3n':                   'sm-burning-shadows',
  'sm3h':                   'sm-burning-shadows',
  'darknessconsumes':       'sm-burning-shadows',
  'seenthebattle':          'sm-burning-shadows',
  'sm4s':                   'sm-crimson-invasion',
  'sm4a':                   'sm-crimson-invasion',
  'awakenedhero':           'sm-crimson-invasion',
  'ultradimensional':       'sm-crimson-invasion',
  'sm5s':                   'sm-ultra-prism',
  'sm5m':                   'sm-ultra-prism',
  'ultrasun':               'sm-ultra-prism',
  'ultramoon':              'sm-ultra-prism',
  'sm6':                    'sm-forbidden-light',
  'forbiddenlight':         'sm-forbidden-light',
  'sm6a':                   'dragon-majesty',
  'dragonstorm':            'dragon-majesty',
  'sm6b':                   'sm-celestial-storm',
  'championroad':           'sm-celestial-storm',
  'sm7':                    'sm-celestial-storm',
  'skyspltting':            'sm-celestial-storm',
  'skysplitting':           'sm-celestial-storm',
  'sm7a':                   'sm-celestial-storm',
  'thunderclapspark':       'sm-celestial-storm',
  'sm7b':                   'sm-lost-thunder',
  'fairyrise':              'sm-lost-thunder',
  'sm8':                    'sm-lost-thunder',
  'superburstimpact':       'sm-lost-thunder',
  'sm8a':                   'sm-team-up',
  'darkorder':              'sm-team-up',
  'sm8b':                   'hidden-fates',
  'gxultrashiny':           'hidden-fates',
  'tagteamgxtagallstars':   'hidden-fates',
  'sm9':                    'sm-team-up',
  'tagbolt':                'sm-team-up',
  'sm9a':                   'sm-unbroken-bonds',
  'nightunison':            'sm-unbroken-bonds',
  'sm10':                   'sm-unbroken-bonds',
  'doubleblaze':            'sm-unbroken-bonds',
  'sm10a':                  'sm-unified-minds',
  'ggend':                  'sm-unified-minds',
  'sm10b':                  'sm-unified-minds',
  'skylegend':              'sm-unified-minds',
  'sm11':                   'sm-cosmic-eclipse',
  'miracletwin':            'sm-cosmic-eclipse',
  'sm11a':                  'sm-cosmic-eclipse',
  'remixbout':              'sm-cosmic-eclipse',
  'sm11b':                  'sm-cosmic-eclipse',
  'dreamleague':            'sm-cosmic-eclipse',
  'sm12':                   'sm-cosmic-eclipse',
  'altergenesis':           'sm-cosmic-eclipse',
  'sm12a':                  'sm-cosmic-eclipse',

  // XY era
  'xybx':                   'xy-base-set',
  'xyby':                   'xy-base-set',
  'xybeginning':            'xy-base-set',
  'xy-bx':                  'xy-base-set',
  'xy-by':                  'xy-base-set',
  'wildblaze':              'xy-flashfire',
  'xy2':                    'xy-flashfire',
  'risingfist':             'xy-furious-fists',
  'xy3':                    'xy-furious-fists',
  'phantomgate':            'xy-phantom-forces',
  'xy4':                    'xy-phantom-forces',
  'gaiavolcano':            'xy-primal-clash',
  'tidalstorm':             'xy-primal-clash',
  'xy5':                    'xy-primal-clash',
  'emeraldbreak':           'xy-roaring-skies',
  'xy6':                    'xy-roaring-skies',
  'banditring':             'xy-ancient-origins',
  'xy7':                    'xy-ancient-origins',
  'blueshock':              'xy-breakthrough',
  'redflash':               'xy-breakthrough',
  'xy8':                    'xy-breakthrough',
  'rageofbroken':           'xy-breakpoint',
  'brokenheavens':          'xy-breakpoint',
  'xy9':                    'xy-breakpoint',
  'awakeningpsychic':       'xy-fates-collide',
  'xy10':                   'xy-fates-collide',
  'feverburst':             'xy-steam-siege',
  'crueltraitor':           'xy-steam-siege',
  'xy11':                   'xy-steam-siege',
  'exbattleboost':          'xy-evolutions',

  // BW era
  'bw1':                    'black-and-white',
  'blackcollection':        'black-and-white',
  'whitecollection':        'black-and-white',
  'bw2':                    'emerging-powers',
  'redcollection':          'emerging-powers',
  'bw3':                    'noble-victories',
  'psychodrive':            'noble-victories',
  'hailblizzard':           'noble-victories',
  'bw4':                    'dark-explorers',
  'darkrush':               'dark-explorers',
  'bw5':                    'dragons-exalted',
  'dragonblade':            'dragons-exalted',
  'dragonblast':            'dragons-exalted',
  'bw6':                    'boundaries-crossed',
  'coldflare':              'boundaries-crossed',
  'freezebolt':             'boundaries-crossed',
  'bw7':                    'plasma-storm',
  'plasmagale':             'plasma-storm',
  'bw8':                    'plasma-freeze',
  'spiralforce':            'plasma-freeze',
  'thunderknuckle':         'plasma-freeze',
  'bw9':                    'plasma-blast',
  'megalocannon':           'plasma-blast',

  // DP era
  'dp1':                    'diamond-and-pearl',
  'spacetimecreation':      'diamond-and-pearl',
  'dp2':                    'mysterious-treasures',
  'secretofthelakes':       'mysterious-treasures',
  'dp3':                    'secret-wonders',
  'shiningdarkness':        'secret-wonders',
  'dp4':                    'majestic-dawn',
  'dawndash':               'majestic-dawn',
  'moonlitpursuit':         'majestic-dawn',
  'dp5':                    'legends-awakened',
  'cryfrommysterious':      'legends-awakened',
  'templeofanger':          'legends-awakened',

  // Vintage base/neo/gym era (best approximate EN matches)
  'expansionpack':          'base-set',
  'expansionpackno':        'base-set-shadowless',
  'neogenesis':             'neo-genesis',
  'neodiscovery':           'neo-discovery',
  'neorevelation':          'neo-revelation',
  'neodestiny':             'neo-destiny',
  'gymheroes':              'gym-heroes',
  'gymchallenge':           'gym-challenge',
  'teamrocket':             'team-rocket',
  'junglepack':             'jungle',
  'fossilmonster':          'fossil',
};

function findEnSet(jpKey, jpName) {
  const jpNorm = norm(jpName ?? jpKey);
  // Direct map check
  for (const [frag, enKey] of Object.entries(JP_TO_EN)) {
    if (jpNorm.includes(frag)) return enKey;
  }
  // Fuzzy: try word fragments from JP name vs EN name
  const words = jpNorm.match(/[a-z0-9]{4,}/g) ?? [];
  let best = null, bestScore = 0;
  for (const [enKey, enV] of Object.entries(enSets)) {
    const enNorm = norm(enV.set_name ?? enV.name ?? enKey);
    const overlap = words.filter(w => enNorm.includes(w)).length;
    if (overlap > bestScore) { bestScore = overlap; best = enKey; }
  }
  return bestScore >= 2 ? best : null;
}

// Sealed product key patterns (JP sealed product names)
const SEALED_KEYS = [
  /booster.*box|box.*booster/i,
  /pack/i,
  /elite.*trainer|\betb\b/i,
  /collection/i,
  /display/i,
];

function bestSealedPrice(products) {
  if (!products || !Object.keys(products).length) return null;
  // prefer booster box
  for (const [k, v] of Object.entries(products)) {
    if (/booster.*box|box.*booster/i.test(k) || /booster.*box/i.test(v.name ?? '')) {
      if (v.market > 0) return { key: k, price: v.market, name: v.name ?? k };
    }
  }
  // fallback: highest market
  let best = null;
  for (const [k, v] of Object.entries(products)) {
    if (v.market > 0 && (!best || v.market > best.price)) best = { key: k, price: v.market, name: v.name ?? k };
  }
  return best;
}

let processed = 0, enriched = 0, mapped = 0;

// Sort by publishedOn desc (most recent first)
const entries = Object.entries(jpSets).sort((a, b) => {
  const da = new Date(a[1].publishedOn ?? 0), db2 = new Date(b[1].publishedOn ?? 0);
  return db2 - da;
});

for (const [key, set] of entries) {
  processed++;
  const cards = set.cards?.fullCardList ?? [];
  if (!cards.length && !Object.keys(set.products ?? {}).length) continue;

  // Top 10 chase cards
  const chaseCards = cards
    .filter(c => c.market > 1)
    .sort((a, b) => b.market - a.market)
    .slice(0, 10)
    .map(c => ({ name: c.name, market: c.market, rarity: c.rarity ?? null, number: c.number ?? null }));

  // Top 3 for summary
  const top3 = chaseCards.slice(0, 3).map(c => `${c.name} $${c.market.toFixed(2)}`).join(' · ');

  // Average chase price (top 10)
  const avgChasePrice = chaseCards.length
    ? Math.round(chaseCards.reduce((a, c) => a + c.market, 0) / chaseCards.length * 100) / 100
    : null;

  // Sealed market
  const sealedHit = bestSealedPrice(set.products ?? {});
  const sealedMarket = sealedHit?.price ?? null;

  // Multiple vs retail (JP retail ~$30 booster box equiv; use 30 as JP booster box MSRP if unknown)
  const jpRetailEst = set.retail ?? 30;
  const multiple = sealedMarket ? Math.round((sealedMarket / jpRetailEst) * 10) / 10 : null;

  // EN mapping
  const enKey = findEnSet(key, set.name ?? set.set_name);
  const enSet = enKey ? enSets[enKey] : null;
  const enSetName = enSet?.set_name ?? enSet?.name ?? null;

  // Signal strength
  const signal = !multiple ? 'no-data'
    : multiple >= 2   ? 'STRONG'
    : multiple >= 1.3 ? 'MODERATE'
    : 'WEAK';

  // Write enriched data back
  set.chaseCards = chaseCards;
  set.chaseTotal = chaseCards.length;
  set.avgChasePrice = avgChasePrice;
  set.sealedMarket = sealedMarket;
  set.jpRetailEst = jpRetailEst;
  set.sealedMultiple = multiple;
  set.leadSignal = signal;
  if (enKey) { set.enSetKey = enKey; set.enSetName = enSetName; mapped++; }
  set.enrichedAt = new Date().toISOString();

  enriched++;

  const yr = set.publishedOn?.slice(0, 4) ?? '????';
  const label = (set.name ?? key).slice(0, 40).padEnd(40);
  const chaseStr = top3 || '(no cards)';
  const sealedStr = sealedMarket ? `sealed $${sealedMarket.toFixed(0)} (${multiple}×)` : 'no sealed';
  const enStr = enKey ? `→ EN:${enKey}` : '→ EN:?';
  console.log(`[${yr}] ${label} | ${signal.padEnd(8)} | ${sealedStr.padEnd(22)} | ${enStr}`);
  if (top3) console.log(`        chase: ${chaseStr}`);
}

writeFileSync(JP_PATH, JSON.stringify(jpDb, null, 2));
console.log(`\n✅ Enriched ${enriched}/${processed} JP sets | ${mapped} mapped to EN | ${JP_PATH}`);
