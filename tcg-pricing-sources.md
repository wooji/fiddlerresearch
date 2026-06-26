# TCG Live Pricing Sources — Ranked

## Tier 1: API + Live (Best)
1. **TCGPlayer API** (official)
   - Pokemon/MTG/Lorcana/Yugioh
   - Live market prices + individual cards
   - Rate-limited (auth required)
   - Update: Real-time (5 min lag)
   - Pros: Official, comprehensive, structured
   - Cons: Auth, rate-limits
   - Verdict: ✓ PRIMARY SOURCE

2. **PriceCharting API** (historical + live)
   - Pokemon/MTG/Lorcana/rare sets
   - Sealed box prices + trend history
   - No auth, public
   - Update: 12-24 hrs
   - Pros: Free, historical, long-tail coverage
   - Cons: Slower refresh, niche sets only
   - Verdict: ✓ SECONDARY (sealed history)

## Tier 2: Scrape-Required (Blocked)
3. **Cardmarket.com** (EU)
   - All TCGs, individual cards
   - Requires Cloudflare bypass
   - Update: Real-time
   - Verdict: Use with curl-impersonate

4. **StarCityGames** (MTG premium)
   - Buylist prices, sealed boxes
   - JavaScript-rendered
   - Verdict: Playwright required

5. **ChannelFireball** (MTG high-end)
   - Premium cards, sealed
   - Cloudflare challenge
   - Verdict: curl-impersonate + proxy

## Tier 3: Marketplace (Noisy)
6. **eBay** (sold comps)
   - All TCGs, 30/90d median
   - Heavy filtering needed
   - Update: Real-time
   - Verdict: ✓ VOLUME ANCHOR (validation only)

7. **StockX** (sealed + premium singles)
   - Pokemon/MTG/One Piece
   - MSRP + market
   - API available (OAuth)
   - Update: Real-time
   - Verdict: ✓ TERTIARY (premium tier)

## Recommendation
**Primary: TCGPlayer API** (live individual + sealed)
**Secondary: PriceCharting** (sealed history + trend)
**Tertiary: StockX** (premium/MSRP validation)
**Validation: eBay sold** (30d median sanity check)

**BLOCK WORKAROUNDS**:
- Cardmarket: `curl-impersonate` + 11k proxy pool
- StarCityGames: Playwright + proxy rotation
- ChannelFireball: curl-impersonate + heroresi residential

## Bi-Weekly Refresh Schedule
- **Sunday 10pm**: Individual card prices (TCGPlayer API, Cardmarket scrape)
- **Wednesday 10pm**: Sealed box prices (PriceCharting, StockX, eBay median)
- State file: `tcg-refresh-schedule.md` (tracks last run, next run)
- Trigger: cron or `/schedule` + notification on completion
