/**
 * set-intel.mjs
 * Live card set data from pokemontcg.io API + Bulbapedia fallback.
 * Returns structured set intel: release date, Mega ex chase cards, rarity counts.
 * Used by fiddler-research.mjs to populate SET_INTEL dynamically.
 */

const POKEMONTCG_API = 'https://api.pokemontcg.io/v2';
const BULBAPEDIA_API = 'https://bulbapedia.bulbagarden.net/w/api.php';

// Known set ID map: SET_INTEL key → pokemontcg.io set ID
export const SET_ID_MAP = {
  'Mega Evolution':       'me1',
  'Phantasmal Flames':    'me2',
  'Ascended Heroes':      'me2pt5',
  'Perfect Order':        'me3',
  'Chaos Rising':         'me4',
  'Pitch Black':          'me5',
  'Storm Emerald':        'me6',
  'Destined Rivals':      'sv10',
  'Prismatic Evolutions': 'sv8a',
  'Paldean Fates':        'sv4pt5',
  'Obsidian Flames':      'sv3',
  'Paldea Evolved':       'sv2',
};

// Rarity tiers that matter for demand analysis
const CHASE_RARITIES = new Set([
  'Special Illustration Rare',
  'Hyper Rare',
  'Illustration Rare',
  'Ultra Rare',
  'Double Rare',
]);

// Cache to avoid redundant API calls within a session
const _cache = new Map();

/**
 * Fetch all chase cards for a set from pokemontcg.io.
 * Returns array of { name, rarity, types, hp } sorted by rarity tier desc.
 */
async function fetchSetCards(setId) {
  if (_cache.has(setId)) return _cache.get(setId);

  try {
    // Fetch Double Rare + higher rarities (the Mega ex and SIR/HR chase cards)
    const url = `${POKEMONTCG_API}/cards?q=set.id:${setId}&pageSize=250&select=name,rarity,subtypes,types,hp,tcgplayer`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`pokemontcg.io ${r.status}`);
    const { data } = await r.json();

    const chase = data
      .filter(c => CHASE_RARITIES.has(c.rarity))
      .map(c => ({
        name:     c.name,
        rarity:   c.rarity,
        isMegaEx: c.subtypes?.includes('MEGA') && c.subtypes?.includes('ex'),
        types:    c.types ?? [],
        hp:       c.hp ? parseInt(c.hp) : null,
        market:   c.tcgplayer?.prices?.holofoil?.market ?? c.tcgplayer?.prices?.normal?.market ?? null,
      }))
      .sort((a, b) => {
        const tier = r => r === 'Special Illustration Rare' ? 0 : r === 'Hyper Rare' ? 1 : r === 'Ultra Rare' ? 2 : r === 'Illustration Rare' ? 3 : 4;
        return tier(a.rarity) - tier(b.rarity);
      });

    _cache.set(setId, chase);
    return chase;
  } catch (e) {
    console.error(`[set-intel] pokemontcg.io error for ${setId}: ${e.message}`);
    return null;
  }
}

/**
 * Fetch set metadata (release date, total cards, printed cards) from pokemontcg.io.
 */
async function fetchSetMeta(setId) {
  const cacheKey = `meta:${setId}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  try {
    const r = await fetch(`${POKEMONTCG_API}/sets/${setId}`);
    if (!r.ok) throw new Error(`pokemontcg.io sets ${r.status}`);
    const { data } = await r.json();
    const meta = {
      name:        data.name,
      series:      data.series,
      releaseDate: data.releaseDate,
      total:       data.total,
      printed:     data.printedTotal,
    };
    _cache.set(cacheKey, meta);
    return meta;
  } catch (e) {
    console.error(`[set-intel] set meta error for ${setId}: ${e.message}`);
    return null;
  }
}

/**
 * Fetch Bulbapedia article summary as a fallback source for set narrative context.
 * Returns plain text extract (first ~500 chars of the article).
 */
async function fetchBulbapediaExtract(setName) {
  const cacheKey = `bulba:${setName}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  try {
    const title = encodeURIComponent(`${setName} (TCG)`);
    const url = `${BULBAPEDIA_API}?action=query&titles=${title}&prop=extracts&exintro=true&explaintext=true&format=json&origin=*`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Bulbapedia ${r.status}`);
    const data = await r.json();
    const pages = Object.values(data.query?.pages ?? {});
    const extract = pages[0]?.extract?.slice(0, 600) ?? null;
    _cache.set(cacheKey, extract);
    return extract;
  } catch (e) {
    console.error(`[set-intel] Bulbapedia error for ${setName}: ${e.message}`);
    return null;
  }
}

/**
 * Main export: resolve live card/set data for a given SET_INTEL key.
 * Returns { meta, megaExCards, topChase, bulbapediaExtract }
 *   megaExCards  — array of Mega ex Double Rare cards in the set
 *   topChase     — SIR + HR cards (the real price anchors)
 *   meta         — release date, total cards
 *   bulbapedia   — plain text intro from Bulbapedia (fallback context)
 */
export async function resolveSetIntel(setKey) {
  const setId = SET_ID_MAP[setKey];
  if (!setId) return null;

  const [cards, meta, bulbapedia] = await Promise.all([
    fetchSetCards(setId),
    fetchSetMeta(setId),
    fetchBulbapediaExtract(setKey),
  ]);

  if (!cards) return null;

  const megaExCards = cards.filter(c => c.isMegaEx);
  const topChase    = cards.filter(c => c.rarity === 'Special Illustration Rare' || c.rarity === 'Hyper Rare');

  return { meta, megaExCards, topChase, allChase: cards, bulbapedia };
}

/**
 * Build a live IP description string from real card data.
 * Used to replace hardcoded `ip:` fields in SET_INTEL.
 */
export function buildIpLine(resolved) {
  if (!resolved) return null;
  const { megaExCards, topChase } = resolved;

  const megaNames = megaExCards.map(c => c.name).join(', ');
  const sirNames  = topChase.map(c => c.name).slice(0, 4).join(', ');

  const parts = [];
  if (megaNames) parts.push(`Mega ex cards: ${megaNames}`);
  if (sirNames)  parts.push(`Top chase (SIR/HR): ${sirNames}`);
  return parts.join(' | ') || null;
}
