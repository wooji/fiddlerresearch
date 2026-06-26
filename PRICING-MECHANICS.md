# Pricing Mechanics (Nagle & Müller Applied to Collectibles)
> **Captures:** Pocket price waterfall, EVC, price lifecycle, buyer segmentation (Nagle & Müller) · DLOM, 3 valuation approaches, days-to-exit (Pratt) · Mr. Market, Margin of Safety, investment vs speculation (Graham) · WTP elevation, pass-through levels, put option framing (PPS/Ribciuc).
> **See also:** `RATING-LOGIC.md` (how frameworks feed into rating thresholds)

## 1. Pocket Price Waterfall
**Sticker price ≠ pocket price.** All concessions erode real margin:
```
Secondary Price (eBay)
  - eBay fee (13%)
  - Shipping (~$5-15 depending on product size)
  - Storage / capital cost (time × opportunity rate)
  - Packaging
= TRUE POCKET PRICE
```
Always calculate ROI on pocket price. A $50 nominal profit held 6 months ≈ $44 real profit (capital cost ~12% annualized).

**Implementation**: `roi = (market × (1 - ebayFee) - shipping - retail) / retail × 100`

## 2. Economic Value to Customer (EVC)
```
EVC = Reference Value (retail MSRP) + Differentiation Value (scarcity + IP + ROI potential)
```
The spread between retail and secondary IS the differentiation value. What destroys it:
- **Reprint** → destroys scarcity differentiation → floor collapses to retail
- **Weak IP** → low differentiation → EVC ≈ retail
- **Strong IP + OOS** → high EVC → secondary can sustain 2-5× retail

**Rule**: Hold thesis ONLY valid when differentiation value is durable (no-reprint confirmed or structural scarcity).

## 3. Price-Volume Tradeoff
Nagle's profit improvement formula: **a 1% price increase = 3-4× the profit impact of a 1% volume increase** (at typical margins).

Implication for collectibles:
- Holding for higher price > racing to move volume
- Exception: perishable windows (reprint incoming, event ends) → flip velocity matters more
- Blasters/mass retail = volume play. Hobby/limited = price play.

## 4. Buyer Segmentation (3 segments in collectibles)
| Segment | Behavior | Price Sensitivity | What They Buy |
|---------|----------|-------------------|---------------|
| **Flipper** | Fast exit, 0-30 days | HIGH — needs immediate margin | Bulk at retail, sell immediately OOS |
| **Investor** | Hold 3-12 months | MEDIUM — needs durable thesis | Hobby boxes, limited editions, no-reprint |
| **Collector** | Completion-driven | LOW — pays premium for specific items | Singles, graded cards, sealed for display |

**Rating recs should target the right segment:**
- High dollar volume + retail OOS → Flipper play (size up)
- No-reprint + strong IP + low volume → Investor play (hold, not flip)
- Graded/single-focused → Collector premium (different market depth)

## 5. Price Lifecycle Stages
```
Launch → FOMO Spike → Stabilization → Reprint/Restock Decay → Floor
```
| Stage | Signal | Action |
|-------|--------|--------|
| Launch | Low sold count, rising price | Buy if thesis strong |
| FOMO Spike | ATH forming, rapid price rise | Sell / exit |
| Stabilization | Price flat, steady velocity | Hold or accumulate |
| Decay | Price falling, reprint confirmed | Exit immediately |
| Floor | At/below retail | No secondary value; flip-only if OOS spikes |

**Implementation**: compare `current / ath` and `current / first` to detect stage:
- `current ≈ ath` → peak / hold or sell
- `current < ath × 0.7` → decay / exit
- `current ≈ first` → launch or floor

## 6. Price Elasticity in Collectibles
- **Near ATH**: Low elasticity (few buyers at peak price, demand is inelastic for serious collectors)
- **Near retail**: High elasticity (many buyers, small discount = big volume jump)
- **OOS**: Effectively inelastic until reprint is confirmed

Implication: thin market at high multiple → small price drops move inventory quickly. Don't hold at 5× hoping for 6× if sold30 < 5.

## 7. Days-to-Exit Metric (TODO — not yet in pipeline)
```
daysToExit = (positionSize / retail) × retail / (dollarVolume / 30)
           = positionSize / (dollarVolume / 30)
```
Example: $3,500 position, $266/month dollar volume → 13 months to exit = terrible capital efficiency despite 100% ROI%.

Should be displayed in embed and penalize ratings for positions that take >90 days to exit.

---

## 8. Business Valuation Frameworks (Pratt, Shannon — Business Valuation, Wiley 2005)
Source: anvari.net/Business%20Valuation/Business%20Valuation.pdf (scanned — extracted from training knowledge)

### Three Approaches to Value (directly applicable to collectibles)

**Income Approach** — value = discounted future cash flows
```
Value = Annual Net Profit / Capitalization Rate
```
For collectibles: `Value = (monthly pocket profit × 12) / required_return_rate`
- If a sealed Topps Hobby box generates $100/yr net and you require 25% return → max buy = $400
- Use this to set a MAXIMUM ENTRY PRICE given expected exit timing

**Market Approach** — value = comparable sales (comps)
```
Value = Subject × (CompSalePrice / CompMetric)
```
This IS what eBay sold data provides. The multiple vs retail IS the market-derived value multiple.
Key rule: comps must be same SKU, same condition, same time window (90d max). Stale comps = stale value.

**Asset Approach** — value = replacement cost / liquidation value
For collectibles: retail MSRP = replacement cost floor. Secondary can NEVER sustainably trade below retail if still in print (arbitrage closes the gap). OOP/retired = replacement cost → ATH becomes the new floor proxy.

### Key Valuation Adjustments
- **Liquidity discount**: illiquid assets trade at 20-35% discount to liquid equivalents. Applied to collectibles: thin eBay market (sold30 < 5) = apply 20-30% discount to "fair value" when computing entry price.
- **Marketability discount**: if you CAN'T sell quickly, the asset is worth less TODAY. Directly supports the days-to-exit penalty in the rating system.
- **Control premium**: owning the only supply = pricing power. First-mover OOS + no reprint = control premium on price.

### DLOM (Discount for Lack of Marketability) — applied to Fiddler
```
effectiveValue = ebayMedian × (1 - liquidityDiscount)
liquidityDiscount = sold30 < 5  → 30%
                  = sold30 5-20 → 15%
                  = sold30 > 20 → 0%
```
This is why Lorcana blister at $14 with 19 sold/mo is NOT the same investment quality as Pokemon ETB at $90 with 100 sold/mo — even if ROI% is identical. The DLOM adjusts the effective value down for thin markets.

### Capitalization Rate vs Discount Rate
- **Cap rate** = required return for a stable, perpetual income stream (use for hold thesis)
- **Discount rate** = required return for a finite, depreciating asset (use for flip thesis)
- Collectibles are almost always discount-rate assets (not perpetual income) → use DCF, not cap rate
- Exception: ATH-proven, retired, fixed-supply sets (LEGO retired, Lorcana Fabled) may justify cap rate if scarcity is truly permanent

### Weighted Average Cost of Capital (WACC) analogy
For $10k/drop investor:
- Risk-free rate: ~5% (T-bill equivalent)
- Collectibles risk premium: 15-25% (illiquidity + market risk + reprint risk)
- Required return = 20-30% minimum to justify deployment over safe alternatives
- Products returning <20% net annualized = below hurdle rate → RED / NO SEND

---

## 9. Graham — The Intelligent Investor (Benjamin Graham, 1949/1973)
Source: THE-INTELLIGENT-INVESTOR.pdf (image-scanned — extracted from training knowledge)

### Mr. Market
Market is a manic-depressive business partner who offers to buy/sell your stake every day at a different price. Some days euphoric (overprices), some days pessimistic (underprices). **You are never obligated to act on his quote.**

Collectibles translation:
- eBay sold30 price IS Mr. Market's daily quote. It fluctuates on hype, news, restocks, tournament results.
- **Never let the market price dictate your thesis.** A dropping price on solid fundamentals (no reprint, strong IP) is Mr. Market being pessimistic — buy window.
- A rising price on weak fundamentals (reprint incoming, declining singles) is Mr. Market being manic — exit window.

### Margin of Safety
Never pay full fair value. Buy at a discount large enough to absorb errors in your analysis.
```
Margin of Safety = (Intrinsic Value - Purchase Price) / Intrinsic Value
```
For collectibles:
- **Intrinsic Value** = ATH × reprintProbabilityDiscount × ipStrengthMultiplier
- **Purchase Price** = retail MSRP or secondary entry point
- Target ≥20% margin of safety on entry. Buying at retail on a no-reprint S-tier set = ~40% MoS (secondary at 1.7× average).
- Buying at 1.4× secondary on a reprint-risk product = negative MoS = speculation, not investment.

### Investment vs. Speculation
> "An investment operation is one which, upon thorough analysis, promises safety of principal and an adequate return. Operations not meeting these requirements are speculative."

Collectibles map:
| Type | Criteria | Rating |
|------|----------|--------|
| **Investment** | No-reprint confirmed, strong IP, dollarVolume >$1k/mo, MoS ≥20% | GREEN/DBLGREEN |
| **Speculation** | Reprint risk, thin market, entry near ATH | ORANGE |
| **Gambling** | No data, hype-only, illiquid | RED |

**Rule**: High ROI% on thin volume with reprint risk = speculation. Label it correctly in the thesis.

### Price vs. Value Distinction
Market price ≠ intrinsic value. They diverge constantly, converge eventually.
- **Short-term**: price is a voting machine (popularity/hype)
- **Long-term**: price is a weighing machine (fundamentals: IP, scarcity, demand floor)

Fiddler implication: sold30 trending down ≠ thesis broken. Check if fundamentals changed (reprint confirmed? IP weakened?). If not → Mr. Market being pessimistic → thesis intact.

### Defensive vs. Enterprising Investor
| Type | Approach | Collectibles |
|------|----------|-------------|
| **Defensive** | Buy diversified, no-brainer safe products, hold | S-tier ETBs, Hobby boxes, LEGO retiring sets |
| **Enterprising** | Deep research, timing, arbitrage | Blister OOS flips, pre-release holds, arbitrage across platforms |

### Volatility ≠ Risk
Price swings are not the same as permanent capital loss. Real risk = buying overpriced with no thesis.
- A 30% price drop on a fixed-print no-reprint set = **volatility** (temporary, Mr. Market pessimistic)
- A 30% price drop after reprint confirmed = **real loss** (thesis broken, exit)

**Rule**: `reprintRisk === 'none'` products can absorb price volatility without rating downgrade. `reprintRisk === 'high'` products cannot — any sustained price drop = thesis deterioration.

---

## 10. Inflation / Market-Price Surge Mechanics (Ribciuc — Journal of Professional Pricing, Q1 2022)
Source: PPS_Journal_22Q1_FINAL.pdf — "Inflation and Price Increases" by Robert Ribciuc, EBITDA Catalyst

### Willingness-to-Pay (WTP) Elevation
When external signals create an environment of rising prices, consumer WTP rises in parallel — even before prices actually increase. For collectibles:
- **Community hype / Discord buzz / sell-through velocity** = proxy for elevated WTP (buy window)
- **OOS at retail** = supply-side shock → inelastic demand → WTP rises sharply
- **Competitor scalpers raising prices** = price signaling effect; each listing at 2× is a signal to buyers that the floor is moving

### Three Pass-Through Levels (applied to collectibles)
| Level | B2C Original | Collectibles Translation |
|-------|-------------|--------------------------|
| **Level 1: Dollar-for-Dollar** | Cost increase → exact price increase, margin preserved | Buy at retail, sell at same ×. Margin flat. |
| **Level 2: Margin Enhancement** | Mitigate cost hit but price at worst-case scenario | Buy early OOS, hold while secondary rises further. Capture spread above mitigation. |
| **Level 3: Commodity Trend Reversal** | Keep high prices even after costs reverse | OOS buy = **put option** at high strike. Sell at peak while retail still OOS. Every unit = "in the money" vs future restock. |

**Key rule**: Giant sellers (market leaders / large scalpers) signal price direction first. When top eBay listings show 2× and climbing, WTP of downstream buyers is already "primed" — that's the Level 2 window. Miss it = Level 1 at best.

### The "Put Option" Framing for OOS Positions
> "Having set the put option for the commodity price at a very high strike price and gotten customers to buy into it, every time ABC sells a unit, it puts the commodity input to its customers at $230 while the market price is $215 and falling." — Ribciuc

Collectibles translation:
- **Buy at launch OOS** = set your put at retail price. Each unit you hold is a call on the secondary market.
- **Secondary at ATH** = exercise the call. Sell into peak WTP.
- **Reprint confirmed** = put gets exercised against you. Exit before strike collapses.
- **No-reprint + retirement** = permanent put — strike never retreats to retail floor.

### Contrarian Play
When every scalper raises simultaneously, some buyers defect. Staying flat (or buying on the down cycle) = picking up buyers abandoned by over-aggressive sellers.
- Signal: market median falls 15%+ from ATH → contrarian accumulation window
- Not applicable to high-reprint risk products (floor can collapse to retail)

### Implications for Fiddler Rating
- **Elevated WTP signal** (Discord buzz + OOS + velocity rising) → upgrade conviction in Thesis bullet
- **Secondary trending up** = Level 2/3 opportunity → support DBLGREEN/GREEN hold thesis
- **Secondary at ATH with slowing velocity** = exit signal, not entry → downgrade hold thesis
- **Reprint = put expires worthless** → cap at ORANGE even with high ROI%

