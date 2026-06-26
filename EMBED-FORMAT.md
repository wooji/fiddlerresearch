# Fiddler Embed Format
> **Captures:** Exact Discord embed field order/format, TL:DR structure, forbidden labels, wrong-SKU pre-send checklist, `DASHBOARD_MODE=1` verify flow.
> **See also:** `WRITEUP-FORMAT.md` (writeup content rules) · `DATA-QUALITY.md` (sanity gates before send)

## Before Sending — ALWAYS
1. Run with `DASHBOARD_MODE=1` first
2. Read `pipeline-results.json` → `embedPayload` — verify ALL fields
3. Confirm retail and market are plausible for the ACTUAL product (not wrong SKU)
4. Only send after manual inspection confirms data integrity

## Title Format
```
🟠 Disney Unknown Wilds Blister Pack (Disney Lorcana — Wilds Unknown)
```
- Rating emoji
- Product label — Title Case (capitalize every word)
- Set name in parentheses
- No extra formatting, no quotes

## TL:DR (Description) Format
```
### TL:DR
> **🟢 FULL SEND | S Tier | $6.99 | $14.25**
```
- Tier only shown when set has DB history
- Retail = `prod.retail` → `detectedRetail` fallback → `` `N/A` ``
- Market = weighted avg or `` `N/A` ``

## Fields — Order and Rules

| Field | Format | Rules |
|-------|--------|-------|
| 💰 Retail | `$6.99` | Price only. NEVER "(auto-detected)", NEVER source notes |
| 📈 Market | `$14.25` | Price only. No source attribution |
| ⚠️ Risk Level | `🟢 Low` | Emoji + label only |
| 📊 Market Range | `$6.00 — $24.00` | Low — High only. No sales count |
| 🔗 Comps | `[eBay](...) \| [Amazon](...) \| [Walmart](...)` | Links only |
| 📦 Bulk Buy Estimate | `**250+**` | Tier count only — no extra text |
| 📈 Current Profitability | `🟢 \`$105.12\`/unit \| \`$120.83\` Est Sale` | |
| 📊 Long Term Profit (T+30) | same format | |
| 📊 Market Analysis | Thesis/Liquidity/Risk bullets | See WRITEUP-FORMAT.md |
| 📦 Product Analysis | Config + Bear/Base/Bull | See WRITEUP-FORMAT.md |

## Forbidden in Embed Fields
- `(auto-detected)` — never label retail as auto-detected
- Source names in price fields ("avg of 4 sources", "Amazon price")
- Sales count in Market Range ("| 47 sold")
- "TBD", "pending", "N/A" in writeup fields — run pipeline first
- Bear/Base/Bull in BOTH writeup.product AND prod.scenarios (dedup)

## Wrong-SKU Check (do before sending)
- eBay median 10-20× expected retail → wrong product matched
- Amazon/Walmart price < retail×0.8 → wrong product matched (too cheap)
- Amazon/Walmart price > ebayMedian×1.5 → wrong product matched (too expensive)
- StockX (ask-bid)/bid > 50% → drop from market calc
- StockX price > ebayMedian×5 → wrong match, null it

## Thumbnail
TCGPlayer image when found (`tcg-image` log line). Falls back to prod.images[0].
