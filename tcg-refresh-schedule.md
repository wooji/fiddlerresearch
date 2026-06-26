# TCG Refresh Schedule — Bi-Weekly Automation

## Routine 1: Individual Card Prices (Sunday 10pm UTC / 6pm EDT)
- **Routine ID**: trig_01URMaJBcDLVjwFUQ2paRf8b
- **Script**: tcg-fetch-cards-v2.mjs
- **Task**: Fetch ALL cards per set from TCGPlayer API (with proxy fallback)
- **Output**: `.cards.fullCardList[].{cardId, name, market, priceHistory, fetchedAt}`
- **Schema**: Appends price to priceHistory, updates current .market, preserves history

## Routine 2: Sealed Box Prices (Wednesday 10pm UTC / 6pm EDT)
- **Routine ID**: trig_01KLNCfKsCc1Qv7zHdUsCupt
- **Script**: tcg-refresh-sealed.mjs
- **Task**: Fetch sealed prices from PriceCharting + StockX (via proxy if blocked)
- **Output**: `.products.{format}.{market, verdict, fetchedAt}`
- **Schema**: Updates sealed price, compares vs `.cards.fullCardList` average, sets "HOLD sealed" or "CRACK singles"

## Data Flow

```
Sunday 10pm:
  tcg-fetch-cards-v2.mjs
  ├─ Load 11k proxies
  ├─ Query TCGPlayer API (or scrape via proxy fallback)
  ├─ For each set: fetch ALL cards
  └─ Update set-history-<category>.json with fullCardList + priceHistory

Wednesday 10pm:
  tcg-refresh-sealed.mjs
  ├─ Query PriceCharting + StockX (via proxy if blocked)
  ├─ For each set: update .products.{format}.market
  ├─ Compare sealed price vs avg(fullCardList prices)
  └─ Set verdict: "HOLD sealed" (sealed > avg*0.8) or "CRACK singles"
```

## DB State After Each Run

**After Sunday**:
```json
{
  "sets": {
    "sv8a": {
      "cards": {
        "fullCardList": [
          {"cardId": "001", "name": "Charizard EX", "market": 45, "priceHistory": [{"date": "2026-06-25", "price": 45}]},
          {"cardId": "002", "name": "Pikachu ex", "market": 35, "priceHistory": [{"date": "2026-06-25", "price": 35}]},
          // ... 200+ total cards
        ],
        "fetchedAt": "2026-06-25T22:00:00Z"
      }
    }
  }
}
```

**After Wednesday**:
```json
{
  "sets": {
    "sv8a": {
      "products": {
        "display-box": {"market": 250, "verdict": "HOLD sealed", "fetchedAt": "2026-06-26T22:00:00Z"},
        "etb": {"market": 60, "verdict": "HOLD sealed"}
      }
    }
  }
}
```

## Infrastructure Ready
✓ 11k proxy pool loaded
✓ TCGPlayer API primary method
✓ Cardmarket scrape fallback
✓ Price history append (never overwrite)
✓ Sealed vs crack verdict automated
✓ Cloud routines live (scheduled)

- 2026-06-25T05:30:15.108Z: COMPLETE sealed prices (0 sets)
- 2026-06-25T05:30:33.605Z: COMPLETE sealed prices (0 sets)
- 2026-06-25T14:42:09.575Z: COMPLETE sealed prices (542 sets)
