/**
 * StockX market-data source for Fiddler pricing.
 *
 * PLACEHOLDER until API key issued. Reads creds from root .env:
 *   STOCKX_API_KEY        (x-api-key header — from Developer Portal "Keys" tab)
 *   STOCKX_CLIENT_ID      (OAuth app client id)
 *   STOCKX_CLIENT_SECRET  (OAuth app client secret)
 *   STOCKX_REFRESH_TOKEN  (from one-time Authorization Code grant via callback URL)
 *
 * OAuth: Auth0 Authorization-Code + refresh. App callback URL registered as
 *   https://localhost/callback  (placeholder; swap to public https when deployed).
 *
 * If any cred is missing → stockxMarket() returns null (silent). Wire creds later,
 * no other code changes needed.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env  = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const API_KEY       = env.STOCKX_API_KEY;
const CLIENT_ID     = env.STOCKX_CLIENT_ID;
const CLIENT_SECRET = env.STOCKX_CLIENT_SECRET;
const REFRESH_TOKEN = env.STOCKX_REFRESH_TOKEN;

const TOKEN_URL  = 'https://accounts.stockx.com/oauth/token';
const API_BASE   = 'https://api.stockx.com/v2';
const AUDIENCE   = 'gateway.stockx.com';

const hasCreds = () => Boolean(API_KEY && CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);

let _token = null;        // { access_token, exp }
async function accessToken() {
  if (_token && Date.now() < _token.exp - 60_000) return _token.access_token;
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    audience:      AUDIENCE,
    refresh_token: REFRESH_TOKEN,
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`stockx token ${r.status}: ${await r.text()}`);
  const j = await r.json();
  _token = { access_token: j.access_token, exp: Date.now() + (j.expires_in ?? 43200) * 1000 };
  return _token.access_token;
}

async function sxFetch(path) {
  const tok = await accessToken();
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${tok}`, 'x-api-key': API_KEY, accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`stockx ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

/**
 * Look up a product on StockX and return its market data.
 * @param {string} query  product name (same as ebayQuery works well)
 * @param {object} opts   { retailFloor } to discard obvious mis-matches
 * @returns {Promise<null | { lowestAsk, highestBid, lastSale, productName, urlKey, source }>}
 */
export async function stockxMarket(query, opts = {}) {
  if (!hasCreds()) return null;                       // placeholder mode
  try {
    const search = await sxFetch(`/catalog/search?query=${encodeURIComponent(query)}&pageSize=5`);
    const candidates = (search?.products ?? search?.hits ?? []);
    // Reject lot/multi-pack/Japanese listings — their retailPrice is for N boxes (e.g. "2x lot"
    // → $240 for two) or wrong region, which poisons MSRP/market. Prefer a clean single English box.
    const wantJP = /japan|japanese|\bjp\b/i.test(query);
    const isBad = t => { const s = (t || '').toLowerCase(); return /\blot\b|\d+\s*x\b|\bx\s*\d+\b|bundle|case of|2-?pack|3-?pack/.test(s) || (!wantJP && /japan|japanese/.test(s)); };
    const hit = candidates.find(h => !isBad(h.title ?? h.name)) ?? candidates[0];
    if (!hit) return null;
    if (isBad(hit.title ?? hit.name)) return null;   // only a bad match available → skip rather than mislead
    const productId = hit.productId ?? hit.id;
    if (!productId) return null;

    // market-data returns an ARRAY of variant rows (string amounts); use first variant
    const mdArr = await sxFetch(`/catalog/products/${productId}/market-data?currencyCode=USD`);
    const md = Array.isArray(mdArr) ? mdArr[0] : mdArr;
    const lowestAsk  = num(md?.lowestAskAmount  ?? md?.standardMarketData?.lowestAsk);
    const highestBid = num(md?.highestBidAmount ?? md?.standardMarketData?.highestBidAmount);
    const lastSale   = null;   // v2 market-data has no true last-sale field

    // mid-market estimate: ask/bid midpoint, else lowest ask, else highest bid
    const price = (lowestAsk && highestBid)
      ? Math.round((lowestAsk + highestBid) / 2)
      : (lowestAsk ?? highestBid);
    if (!price) return null;
    if (opts.retailFloor && price < opts.retailFloor * 0.5) return null;   // mis-match guard

    // StockX MSRP lives in productAttributes.retailPrice (verified retail from the product page)
    const msrp = num(hit.productAttributes?.retailPrice ?? hit.retailPrice ?? hit.msrp ?? hit.suggestedRetailPrice ?? null);

    return {
      price, lowestAsk, highestBid, lastSale,
      msrp,
      productName: hit.title ?? hit.name ?? query,
      urlKey:      hit.urlKey ?? null,
      source:      'stockx',
    };
  } catch (e) {
    console.error('  [stockx]', e.message);
    return null;
  }
}

const num = v => (v == null || isNaN(+v)) ? null : +v;
