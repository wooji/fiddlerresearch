# Fiddler Rating Logic
> **Captures:** Send rating matrix (MEGA/FULL/LIGHT/NO SEND), $10k capital deployment framework, DLOM, days-to-exit, reprint risk gates, tier-to-rating mapping, send label rules.
> **See also:** `PRICING-MECHANICS.md` (valuation theory) · `CATEGORY-MECHANICS.md` (per-category thresholds)

## Core Principle: $10k Capital Deployment Framework
Every rating answers: "If I had $10k to deploy on this drop, what should I do?"
ROI% alone means nothing if market depth can't absorb the position.

## Primary Formula: ROI × Dollar Volume
**Dollar Volume** = `ebayMedian × sold30` — how many $ of product moves on eBay per month.

| Rating | Emoji | ROI | Dollar Vol/mo | Meaning |
|--------|-------|-----|----------------|---------|
| DBLGREEN | 🟢🟢 MEGA SEND | ≥40% | ≥$5,000 | Deploy full $10k, exit in ≤60 days |
| GREEN | 🟢 FULL SEND | ≥25% | ≥$1,000 | Deploy $7-8k, exit in 60-90 days |
| GREEN | 🟢 FULL SEND | ≥60% | ≥$200 | Very high ROI, thin but worth sizing |
| ORANGE | 🟠 LIGHT SEND | ≥15% | ≥$200 | Size down — either thin market OR moderate ROI |
| ORANGE | 🟠 LIGHT SEND | ≥40% | <$200 | High ROI% but can't deploy meaningfully |
| RED | 🔴 NO SEND | <15% | any | Skip — fees eat the margin |
| RED | 🔴 NO SEND | any | <$50 | Market too thin to matter |

## ROI Definition
Always **net pocket price ROI** after all fees:
- `roi = (salePrice - retail - ebayFee - shipping) / retail × 100`
- eBay fee default: 13%. Never use gross.

## Tier Adjustment (from category DB history)
Set tier from `lib/category-tiers.mjs` modifies the computed rating when no `forceRating` is set:

| DB Tier | Effect |
|---------|--------|
| S+ / S | Floor at 🟢 FULL SEND |
| A | Floor at 🟠 LIGHT SEND |
| D | Cap at 🟠 LIGHT SEND |
| B / C | No adjustment |

`forceRating` on a product always overrides both signal rating AND tier adjustment.

## NEVER auto-assign forceRating on dashboard stubs
Dashboard `create-product` must NOT set `forceRating`. Let signals compute the real rating.
Only set `forceRating` manually when there's a specific analytical reason (e.g. preRelease with no eBay data, known event-limited product).

## Send Label Rules (exact — no variations)
- DBLGREEN = `🟢🟢 MEGA SEND`
- GREEN = `🟢 FULL SEND`
- ORANGE = `🟠 LIGHT SEND`
- RED = `🔴 NO SEND`

## TL:DR Line Format
```
🟢🟢 MEGA SEND | S Tier | $199.99 | $340.00
```
- Rating emoji + label first
- Tier (if DB history exists) second — `S Tier`, `A Tier`, etc.
- Retail third
- Market fourth
- No extra text, no parenthetical notes

## Days-to-Exit (TODO — not yet implemented)
`daysToExit = positionCost / monthlyDollarVolume × 30`
Should be shown in embed and factor into rating. A 100% ROI held 12 months = ~85% effective ROI after capital cost.
