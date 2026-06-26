# TCG Price Refresh Status

## Current: 2026-06-25 06:04 UTC

### Tasks
- [ ] MTG card fetch (Scryfall) — RUNNING
- [ ] Verify set-history-mtg.json has fullCardList
- [ ] Run sealed pricing (tcg-refresh-sealed.mjs)
- [ ] Setup cloud scheduler (Sunday 10pm, Wednesday 10pm UTC)

### Data Sources
| Source | Type | Coverage | Status |
|--------|------|----------|--------|
| Scryfall | Individual cards | MTG only | ✓ Working |
| PriceCharting | Sealed products | Pokemon/MTG/Lorcana | ✓ Ready |
| StockX | Sealed + graded | Collectibles | ✓ Ready |

### Scripts Location
- `scryfall-fetch-cards-v2.mjs` — MTG cards (1288 sets, throttled 800ms/set)
- `tcg-refresh-sealed.mjs` — Sealed prices via PC + StockX
- `patch-tcg-ids.mjs` — tcgId backfill (one-time)
