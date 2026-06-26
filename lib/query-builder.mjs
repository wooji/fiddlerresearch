/**
 * buildQueryVariants(prod) — smart search query generator per category
 * Returns { primary, variants[], reddit[], youtube[], blowout, ebay }
 * Rule: strip format/packaging words, keep BRAND + SET NAME + YEAR
 * Fallback chains ensure we NEVER return 0 results.
 */

// ── Stop words per category ────────────────────────────────────────────────
const POKEMON_STOP = /\b(pokemon trading card game|pokemon tcg|pokemon|trading card game|tcg|elite trainer box|etb|booster box|booster|blaster|display|case|presale|pre-?order|sealed|new|\d+ packs?|hobby box|hobby|value box|mega box|hanger|jumbo|single|blisters?|collection box|collection|tin|bundle|premium collection|special collection)\b/gi;
const SPORTS_STOP  = /\b(topps|panini|upper deck|donruss|select|prizm|mosaic|optic|chronicles|hobby box|hobby|blaster box|blaster|hanger box|hanger|mega box|mega|value box|value|jumbo box|jumbo|fat pack|loose pack|sealed|new|pre-?order|presale)\b/gi;
const MTG_STOP     = /\b(magic the gathering|magic:|mtg|play booster box|play booster|collector booster box|collector booster|set booster box|set booster|draft booster box|draft booster|booster box|booster|commander deck|prerelease kit|bundle|gift bundle|jumpstart|precon|sealed|new)\b/gi;
const LORCANA_STOP = /\b(disney lorcana|lorcana|disney|booster box|booster pack|blister|starter deck|illumineer's trove|gift set|deluxe starter set|sealed|new)\b/gi;
const GENERIC_STOP = /\b(sealed|new|presale|pre-?order|box|set|collection|series|edition|limited|special|deluxe|premium|hobby|retail)\b/gi;

function stripStop(str, rx) {
  return str.replace(rx, '').replace(/[-–—:,]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function yearOf(str) {
  return str.match(/\b(20\d{2})\b/)?.[1] ?? '';
}

// ── Sports card tier reference ─────────────────────────────────────────────
export const SPORTS_TIERS = {
  hobby:   { label: 'Hobby Box',    retail: { baseball: 120, basketball: 90, football: 110, ufc: 100 }, multiplier: [1.3, 1.8], channels: ['hobby shop', 'blowout', 'steel city'], resell: 'hold', notes: 'No reprint. Fixed run. Appreciates with strong rookie class.' },
  jumbo:   { label: 'Jumbo/HTA Box', retail: { baseball: 110, basketball: 130, football: 120 }, multiplier: [1.2, 1.6], channels: ['hobby shop'], resell: 'hold', notes: 'Fewer boxes per case, higher pack count. More autos/relics per box.' },
  blaster: { label: 'Blaster/Value Box', retail: { baseball: 25, basketball: 25, football: 30 }, multiplier: [0.8, 1.0], channels: ['Target', 'Walmart'], resell: 'skip', notes: 'Continuous restock. No secondary premium. Flip immediately if OOS spike.' },
  hanger:  { label: 'Hanger Pack', retail: { baseball: 10, basketball: 10, football: 10 }, multiplier: [0.5, 0.9], channels: ['Target', 'Walmart'], resell: 'skip', notes: 'Filler product. Commons only. No secondary market value.' },
  mega:    { label: 'Mega Box', retail: { baseball: 35, basketball: 35, football: 40 }, multiplier: [0.9, 1.1], channels: ['Target'], resell: 'light', notes: 'Target-exclusive. Slightly better hits than blaster. OOS spikes briefly.' },
  fatpack: { label: 'Fat Pack/Cello', retail: { baseball: 20, basketball: 20, football: 20 }, multiplier: [0.7, 0.9], channels: ['Target', 'Walmart'], resell: 'skip', notes: 'Bulk packs. No premium cards guaranteed. No secondary.' },
};

// ── MTG product tier reference ─────────────────────────────────────────────
export const MTG_TIERS = {
  collector_box:  { label: 'Collector Booster Box', packs: 12, msrp: 324, multiplier: [0.5, 3.0], notes: '100% rares. Exclusive foil treatments. Only flip crossover IP (Marvel, FF, Hobbit).' },
  play_box:       { label: 'Play Booster Box', packs: 30, msrp: 210, multiplier: [0.8, 1.2], notes: 'Draftable. Standard sets trend below MSRP by month 2. Good EV for crossover sets.' },
  bundle:         { label: 'Bundle', packs: 9, msrp: 70, multiplier: [0.9, 1.0], notes: '9 Play Boosters + basics. Neutral floor. No premium.' },
  gift_bundle:    { label: 'Gift Bundle', packs: '9+1C', msrp: 90, multiplier: [0.9, 1.1], notes: '9 Play + 1 Collector. Slight premium over bundle due to Collector pack.' },
  commander_deck: { label: 'Commander Deck', cards: 100, msrp: 50, multiplier: [0.9, 1.2], notes: 'Precon EDH. Singles value varies. Strong theme decks hold $40-60.' },
  secret_lair:    { label: 'Secret Lair', cards: '3-7', msrp: [30, 50], multiplier: [1.5, 4.0], notes: 'LIMITED PRINT. Sealed appreciates post-drop. Crack for singles OR hold sealed.' },
  prerelease:     { label: 'Prerelease Kit', packs: 6, msrp: 32, multiplier: [0.9, 1.0], notes: '6 Play + promo foil. Event-only. No secondary premium.' },
  jumpstart:      { label: 'Jumpstart Booster Box', packs: 24, msrp: 132, multiplier: [1.0, 1.1], notes: 'Casual half-decks. Niche demand. Weak flip target.' },
};

// ── Lorcana product tier reference ────────────────────────────────────────
export const LORCANA_TIERS = {
  booster_box:       { label: 'Booster Box (24 packs)', packs: 24, msrp: 120, multiplier: [1.2, 1.8], notes: 'PRIMARY flip/hold target. 9 cards/pack. OOS fast post-release.' },
  booster_pack:      { label: 'Single Booster / Blister', packs: 1, msrp: 6, multiplier: [1.0, 1.3], notes: 'Single pack blister. Low value individually. Only track if box OOS.' },
  starter_deck:      { label: 'Starter Deck', cards: 60, msrp: 15, multiplier: [0.9, 1.2], notes: 'Gameplay product. Low secondary. Avoid.' },
  illumineers_trove: { label: "Illumineer's Trove", packs: 4, msrp: 30, multiplier: [1.1, 1.5], notes: '4 packs + accessories. Moderate secondary.' },
  gift_set:          { label: 'Gift Set', packs: '4-8', msrp: [30, 50], multiplier: [1.0, 1.4], notes: 'Promo cards included. Varies per set.' },
};

export const LORCANA_SETS = [
  { code: 'TFC',  name: 'The First Chapter',    alt: ['first chapter', 'chapter 1'] },
  { code: 'ROTF', name: 'Rise of the Floodborn', alt: ['rise of the floodborn', 'floodborn', 'chapter 2'] },
  { code: 'ITI',  name: 'Into the Inklands',     alt: ['into the inklands', 'inklands', 'chapter 3'] },
  { code: 'UR',   name: "Ursula's Return",       alt: ['ursulas return', 'chapter 4'] },
  { code: 'SS',   name: 'Shimmering Skies',      alt: ['shimmering skies', 'chapter 5'] },
  { code: 'AS',   name: 'Azurite Sea',           alt: ['azurite sea', 'chapter 6'] },
  { code: 'AI',   name: "Archazia's Island",     alt: ['archazias island', 'chapter 7'] },
  { code: 'WOU',  name: 'Wilds of the Unknown',  alt: ['wilds of the unknown', 'wilds unknown', 'chapter 8'] },
];

// ── Main export ────────────────────────────────────────────────────────────
export function buildQueryVariants(prod) {
  const label    = prod.label ?? '';
  const cat      = (prod.category ?? '').toLowerCase();
  const year     = yearOf(label);
  const isPokemon  = cat === 'pokemon' || /pokemon/i.test(label);
  const isSports   = ['topps', 'panini', 'upper_deck', 'sports', 'baseball', 'basketball', 'football', 'ufc'].some(c => cat.includes(c));
  const isMTG      = cat === 'mtg' || cat.includes('magic') || /^mtg/i.test(label);
  const isLorcana  = cat.includes('lorcana') || /lorcana/i.test(label);
  const isLego     = cat.includes('lego') || /lego/i.test(label);
  const isVinyl    = cat.includes('vinyl') || /vinyl|record|lp/i.test(label);

  let setName = '';
  let variants = [];
  let reddit   = [];
  let youtube  = [];
  let blowout  = null;
  let ebay     = prod.ebayQuery ?? label;

  // ── Pokemon ──────────────────────────────────────────────────────────────
  if (isPokemon) {
    setName = stripStop(label, POKEMON_STOP);
    const shortSet = setName.replace(/\b20\d{2}\b/g, '').trim();
    variants = [
      `pokemon ${setName}`,
      `pokemon tcg ${setName}`,
      shortSet ? `pokemon ${shortSet}` : null,
      `pokemon ${setName} booster box`,
      `pokemon ${setName} etb`,
    ].filter(Boolean);
    reddit  = [`pokemon ${setName}`, `pokemon ${shortSet || setName}`, `${setName} pokemon tcg`];
    youtube = [`pokemon ${setName} box break`, `pokemon tcg ${setName} opening`, `${setName} booster box pull`];
    blowout = `${setName} pokemon`;
    ebay    = prod.ebayQuery ?? `Pokemon ${setName} booster box`;

  // ── Sports Cards ─────────────────────────────────────────────────────────
  } else if (isSports) {
    setName = stripStop(label, SPORTS_STOP);
    // detect sport
    const sport = /basketball|nba/i.test(label) ? 'basketball' : /football|nfl/i.test(label) ? 'football' : /ufc|mma/i.test(label) ? 'ufc' : 'baseball';
    // detect tier
    const tier = /jumbo|hta/i.test(label) ? 'jumbo' : /blaster|value/i.test(label) ? 'blaster' : /hanger/i.test(label) ? 'hanger' : /mega/i.test(label) ? 'mega' : 'hobby';
    // detect brand for short form
    const brand = /topps/i.test(label) ? 'topps' : /panini/i.test(label) ? 'panini' : /upper.?deck/i.test(label) ? 'upper deck' : '';
    const shortNoTopps = setName.replace(/topps/i, '').replace(/panini/i, '').replace(/\s+/g, ' ').trim();
    variants = [
      `${year} ${setName} hobby box`.trim(),
      `${year} ${shortNoTopps} hobby box`.trim(),
      `${setName} ${tier} box ${year}`.trim(),
      `${year} ${setName}`.trim(),
    ].filter(v => v.length > 5);
    reddit  = [`${year} ${setName}`, `${year} ${shortNoTopps}`, `${setName} hobby box`];
    youtube = [`${year} ${setName} hobby box break`, `${year} ${shortNoTopps} break`, `${setName} opening ${year}`];
    blowout = `${year} ${setName}`;
    ebay    = prod.ebayQuery ?? `${year} ${setName} hobby box sealed`;

  // ── MTG ──────────────────────────────────────────────────────────────────
  } else if (isMTG) {
    setName = stripStop(label, MTG_STOP);
    // detect product type
    const isCB  = /collector/i.test(label);
    const isSL  = /secret.?lair|sl/i.test(label);
    const isCmd = /commander/i.test(label);
    const typeLabel = isSL ? 'secret lair' : isCB ? 'collector booster' : isCmd ? 'commander' : 'magic';
    variants = [
      `magic ${setName}`,
      `magic the gathering ${setName}`,
      `mtg ${setName}`,
      isCB  ? `magic ${setName} collector booster` : null,
      isSL  ? `secret lair ${setName}` : null,
      isCmd ? `magic ${setName} commander deck` : null,
      `${typeLabel} ${setName}`.trim(),
    ].filter(Boolean);
    reddit  = [`magic ${setName}`, `mtg ${setName}`, `${isSL ? 'secret lair' : 'magic'} ${setName}`];
    youtube = [`magic the gathering ${setName} opening`, `mtg ${setName} box break`, `${setName} magic ${year}`];
    blowout = `magic ${setName}`;
    ebay    = prod.ebayQuery ?? `Magic The Gathering ${setName} sealed`;

  // ── Lorcana ──────────────────────────────────────────────────────────────
  } else if (isLorcana) {
    setName = stripStop(label, LORCANA_STOP);
    // find canonical set name
    const setRecord = LORCANA_SETS.find(s => s.alt.some(a => label.toLowerCase().includes(a)) || label.toLowerCase().includes(s.name.toLowerCase()));
    const canonSet  = setRecord?.name ?? setName;
    const shortSet  = setRecord?.alt[0] ?? setName;
    variants = [
      `lorcana ${canonSet} booster box`,
      `disney lorcana ${canonSet}`,
      `lorcana ${shortSet}`,
      `disney lorcana ${shortSet} booster box`,
      `lorcana ${canonSet} booster`,
    ].filter(v => v.length > 5);
    reddit  = [`lorcana ${canonSet}`, `lorcana ${shortSet}`, `disney lorcana ${shortSet}`];
    youtube = [`lorcana ${canonSet} booster box opening`, `disney lorcana ${shortSet} box break`, `lorcana ${shortSet} pull rates`];
    blowout = `lorcana ${canonSet}`;
    ebay    = prod.ebayQuery ?? `Disney Lorcana ${canonSet} booster box sealed`;

  // ── LEGO ─────────────────────────────────────────────────────────────────
  } else if (isLego) {
    const setNum = label.match(/\b(\d{5})\b/)?.[1] ?? '';
    setName = label.replace(/lego/i, '').replace(/\b\d{5}\b/, '').replace(GENERIC_STOP, '').replace(/\s+/g, ' ').trim();
    variants = [
      setNum ? `lego ${setNum}` : `lego ${setName}`,
      `lego ${setName} ${setNum}`.trim(),
    ];
    reddit  = [`lego ${setNum || setName}`, `lego ${setName}`];
    youtube = [`lego ${setNum || setName} review`, `lego ${setName} speed build`];
    blowout = null;
    ebay    = prod.ebayQuery ?? `LEGO ${setNum} ${setName} sealed new`;

  // ── Vinyl / Collectibles ─────────────────────────────────────────────────
  } else {
    setName = label.replace(GENERIC_STOP, '').replace(/\s+/g, ' ').trim();
    variants = [setName, `${setName} resell`, `${setName} ${year}`.trim()];
    reddit  = [setName, `${setName} worth`];
    youtube = [`${setName} unboxing`, `${setName} review`];
    blowout = null;
    ebay    = prod.ebayQuery ?? setName;
  }

  // Dedupe + filter empties
  const dedup = arr => [...new Set(arr.filter(v => v && v.length > 3))];

  return {
    primary:  variants[0],
    variants: dedup(variants),
    reddit:   dedup(reddit),
    youtube:  dedup(youtube),
    blowout,
    ebay,
    setName,
    isTCG: isPokemon || isMTG || isLorcana,
  };
}
