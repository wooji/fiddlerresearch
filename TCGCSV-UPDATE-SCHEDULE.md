# TCGCSV Daily Update Schedule

**Source:** https://tcgcsv.com (free TCGPlayer data re-export)

## Daily Update Time
- **20:00 UTC** — tcgcsv generates daily CSV/JSON dumps
- **Recommended fetch time:** 20:30 UTC (after generation complete)

## Available Data
- **Categories:** Magic, Pokemon, YuGiOh, Lorcana, and others
- **Per-category:** Groups (sets) + Products (individual cards + market prices)
- **Updates:** Daily, no rate limits observed

## API Endpoints
```
GET https://tcgcsv.com/tcgplayer/categories
GET https://tcgcsv.com/tcgplayer/categories/{categoryId}/groups
GET https://tcgcsv.com/tcgplayer/groups/{groupId}/products
```

## Script
- `tcgcsv-fetch-cards.mjs` — Fetches all individual card prices from tcgcsv API
- No auth required
- Covers: Pokemon, Magic, Lorcana (expandable)

## Recommendation
**Replace Scryfall + eBay scraping with tcgcsv:**
- Single unified API for all TCGs
- Free, no rate limits, daily refresh
- Individual card prices (+ sealed if needed)
- No proxy rotation needed
- No Cloudflare blocking

## New Schedule
- **Run tcgcsv-fetch-cards.mjs at 20:30 UTC daily** (or via cloud routine)
- **Keep eBay/T&T as backup** if tcgcsv missing data
- **Drop Scryfall** (redundant with tcgcsv)
