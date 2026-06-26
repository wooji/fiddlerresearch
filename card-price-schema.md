# Individual Card Price Database Schema

## Structure (per set-history-<category>.json)

```json
{
  "sets": {
    "sv8a": {
      "name": "SV8a",
      "label": "Pokemon SV8a",
      "retail": 144,
      "tcgId": 12345,
      "cards": {
        "chaseCards": [...],
        "chaseTotal": 400,
        "avgChasePrice": 35,
        "fetchedAt": "2026-06-25T22:00:00Z",
        "fullCardList": [  // NEW: ALL cards in set
          {
            "cardId": "sv8a-001",
            "name": "Charizard EX",
            "rarity": "Holo Rare",
            "market": 45.00,
            "priceHistory": [  // timestamp array
              { "date": "2026-06-25", "price": 45.00, "source": "tcgplayer" },
              { "date": "2026-06-18", "price": 42.50, "source": "tcgplayer" }
            ],
            "fetchedAt": "2026-06-25T22:00:00Z"
          },
          {
            "cardId": "sv8a-002",
            "name": "Pikachu ex",
            "rarity": "Holo Rare",
            "market": 35.00,
            "priceHistory": [
              { "date": "2026-06-25", "price": 35.00, "source": "tcgplayer" }
            ],
            "fetchedAt": "2026-06-25T22:00:00Z"
          }
          // ... all 200+ cards in the set
        ]
      },
      "products": {
        "display-box": { market: 250, retail: 144, verdict: "HOLD sealed" },
        "etb": { market: 60, retail: 50, verdict: "HOLD sealed" }
      }
    }
  }
}
```

## Update Logic (Bi-Weekly)

**Sunday 10pm UTC**: Fetch individual cards
- Query source API for EVERY card in each set
- Store current price under `.cards.fullCardList[].market`
- Append to `.cards.fullCardList[].priceHistory` with date + source
- Persist timestamp to `.cards.fetchedAt`

**Wednesday 10pm UTC**: Fetch sealed products
- Query PriceCharting/StockX for sealed box prices
- Update `.products.{format}.market`
- Compare sealed vs fullCardList average → set verdict
- Persist timestamp to `.products.fetchedAt`

## Data Consistency Rules
1. **Every card must have a price** — if source returns null, skip that card or use prior price + "stale" flag
2. **Price history never overwrites** — only appends (tracks trend)
3. **Single source of truth** — all cards from same source per run (not blended)
4. **Timestamp = fetch time** — when the data was retrieved, not published

## Query Examples
```bash
# All cards in SV8a above $30
jq '.sets.sv8a.cards.fullCardList[] | select(.market > 30)' set-history.json

# Price trend for Charizard EX
jq '.sets.sv8a.cards.fullCardList[] | select(.name == "Charizard EX") | .priceHistory' set-history.json

# Sealed vs average card price
sealed=$( jq '.sets.sv8a.products["display-box"].market' )
avgCard=$( jq '.sets.sv8a.cards.fullCardList | map(.market) | add / length' )
echo "Sealed: $sealed | Avg Card: $avgCard"
```
