# Pokemon DB Schema Expansion

## Current Schema (set-history.json)
```json
{
  "_meta": { "source": "pricecharting", "updated": "2026-06-24" },
  "sets": {
    "pokemon-set-slug": {
      "name": "Set Name",
      "firstMonth": "YYYY-MM",
      "products": {
        "booster-box": {
          "current": 123.45,
          "currentMonth": "YYYY-MM",
          "ath": 456.78,
          "athMonth": "YYYY-MM",
          "first": 100.00,
          "firstMonth": "YYYY-MM",
          "months": 12.5,
          "url": "https://...",
          "series": [
            { "m": "YYYY-MM", "price": 123.45 }
          ]
        }
      }
    }
  }
}
```

## Proposed Extensions

### 1. Product Volatility (optional field per product)
```json
"booster-box": {
  ...existing...,
  "volatility": 0.15,  // std dev of monthly % changes
  "trend": "stable",   // "stable" | "uptrend" | "downtrend"
  "dominantSeller": "TCGPlayer", // rough estimate
  "regionPremium": { "JP": 1.35 } // JP premium over ENG
}
```

### 2. Premium Collections (manual entries, not PC-scraped)
```json
"sets": {
  "pokemon-set-slug": {
    "products": {
      "booster-box": { ...existing... },
      "premium-collection-[variant]": {
        "name": "Ultimate Premium Collection Box",
        "source": "manual|stockx|ebay",
        "current": 249.99,
        "ath": 399.99,
        "athDate": "2026-06-15",
        "firstMonth": "2026-05",
        "retail": 99.99,
        "notes": "Limited run, not on PriceCharting"
      }
    }
  }
}
```

### 3. Supply Metrics (optional, for future)
```json
"supplies": {
  "sealed_count": 1200,  // eBay listing count (approx)
  "seller_concentration": 0.08, // HHI index (top 3 sellers)
  "shipping_premium": 1.12  // avg shipped price vs local
}
```

## Implementation Plan

1. ✓ Backfill standard types (booster-box, ETB, bundle, pack) across all 305 sets (in progress)
2. Add volatility / trend fields (computed from series data after backfill)
3. Create premium-collection records from:
   - Historical eBay sales (if available)
   - StockX if they track premium boxes
   - Manual entries from Discord intel / user data
4. Skip regional premium tracking for now (single-source PC)

## DB Structure Choice

Keep flat (all product types in one "products" object). This allows:
- Unified product iteration
- Simple price comparison across types per set
- Easy historical tracking without nested levels
