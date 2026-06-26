# Fiddler Data Quality Rules
> **Captures:** Wrong-SKU detection thresholds, price sanity gates (floor/ceiling), corrections flow (`_userNotes` → `claude -p` synthesis), verify-before-send checklist, `detectedRetail` fallback logic.
> **See also:** `EMBED-FORMAT.md` (verify checklist) · `CATEGORY-MECHANICS.md` (per-category retail anchors)

## The Cardinal Rule
**NEVER send an embed with wrong-SKU pricing data.**
Always run `DASHBOARD_MODE=1`, read `embedPayload`, verify retail and market are plausible BEFORE sending.

## Wrong-SKU Detection
If any of these are true → wrong product matched → fix `ebayQuery` and rerun:
- `ebayMedian > retail × 10` → almost certainly a booster box when you want a blister
- `amazon.price < retail × 0.8` → accessories or wrong listing
- `amazon.price > ebayMedian × 1.5` → bundle/wrong SKU
- `walmart.price > ebayMedian × 1.5` → wrong product
- `stockx.price > ebayMedian × 5` → wrong product on StockX
- `(stockx.ask - stockx.bid) / stockx.bid > 0.5` → no real market, drop StockX

## eBay Query Specificity Rules
- Include product format in query: "blister single pack" not just "blister pack"
- Include year for sports cards: "2026 Topps Chrome Baseball hobby box"
- Include set name for TCG: "Disney Lorcana Wilds of the Unknown blister single pack"
- NEVER use generic brand-only queries: "Disney Lorcana" → too broad, matches everything
- Test: if eBay median is 5-20× expected retail → query is matching wrong product

## Retail Field Rules
- Always set `prod.retail` explicitly in `dynamic-products.json` for known products
- `detectedRetail` (auto-detected from in-stock signals) is a fallback only
- Verify: if `detectedRetail` is suspect (wrong product on Amazon), override with correct value
- NEVER display "(auto-detected)" label — just show the price

## preRelease Flag
- `preRelease: true` → suppresses market unless `_ebayHasRealSales` (sold30>5 OR sold90>10)
- Dashboard stubs start as `preRelease: true` — remove it once product is live and eBay has real data
- `forceRating` should NOT be auto-assigned to dashboard stubs

## Signal Sanity Gates (in code)
```
Amazon/Walmart valid: price >= retail × 0.8 AND price <= ebayMedian × 1.5
StockX valid: (ask-bid)/bid <= 0.5 AND price <= ebayMedian × 5
retailInStock: price >= retail × 0.8 AND price <= retail × 1.05
```

## Corrections Box (USER_NOTES)
Free-text corrections flow:
1. Structured overrides parsed: `retail is $X`, `amazon incorrect`, `ebay wrong`, `market is $X`
2. Signal overrides applied before market calculation
3. `claude -p` synthesis when notes present → generates new Thesis/Liquidity/Risk from corrected data
4. Never outsource corrections to the user — fix the data yourself before sending

## Verify Checklist Before Every Send
- [ ] Title: correct product name, Title Case, correct rating emoji
- [ ] TL:DR: retail is the right MSRP, market is plausible for THIS product
- [ ] Retail field: no "(auto-detected)" label
- [ ] Market field: not 10× above expected retail
- [ ] Market Analysis: Thesis numbers match the pricing fields
- [ ] Product Analysis: Bear ≈ retail (not 10× retail)
- [ ] Bear/Base/Bull not duplicated (appears only once)
