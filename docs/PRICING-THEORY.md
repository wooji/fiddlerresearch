# Pricing Theory Frameworks — Fiddler Research Integration

Sources: 5 books in this folder. Each section maps theory → Fiddler implementation.

---

## 1. Graham: The Intelligent Investor (intelligent-investor-graham.pdf)

### Core Principles → Fiddler Mapping

**Margin of Safety**
Theory: Never buy unless price is substantially below intrinsic value. Buffer against error/bad luck.
Fiddler rule: `exitPenalty` + `riskPts` provide this buffer. Never rate GREEN unless ROI ≥ 40% (after fees + tax).
A 40% ROI = ~10-15% downside cushion before position breaks even at 0%. Under 40% = insufficient margin.

**Mr. Market (Ch. 8)**
Theory: Market is manic-depressive. It offers you a price every day; you transact only when favorable.
Fiddler rule: Secondary market price is Mr. Market's offer. When product is OOS + secondary ≥ 2× retail,
market is in "euphoria phase" — momentum favors buying/holding. When restocked, Mr. Market snaps back.
Do NOT buy at secondary price peak (near ATH). Optimal entry = retail purchase before OOS spike.

**Investment vs Speculation**
Theory: Investment = thorough analysis → principal safety + adequate return. Everything else = speculation.
Fiddler rule: `ratingRoi ≥ 40 + dollarVol ≥ $5k + riskPts ≥ 10` = Investment grade (DBLGREEN).
`ratingRoi 15-40` = speculative (ORANGE/GREEN). Under 15% ROI = not worth the capital lock.

**Avoid losses first (50% loss requires 100% recovery)**
Fiddler rule: `exitPenalty` flags positions where downside = wipeout (restocking = back to retail = -50% loss).
One Piece reprint window (3-6 months post-release) = the kill switch. Must exit before reprint announcement.

**The relatively unpopular large company**
Theory: Strong products at temporary discount = best entry. A correction ≠ fundamentals broken.
Fiddler rule: `market < 1.3× retail` on a known S-tier set = entry signal, not exit signal. Temporary dip.

---

## 2. McKinsey Valuation — Koller, Goedhart, Wessels (mckinsey-valuation-koller.pdf)

### Core Principles → Fiddler Mapping

**Value = ROIC × Growth / Cost of Capital**
Theory: Companies (and assets) create value only when ROIC > cost of capital.
Fiddler mapping:
- ROIC = ROI per capital-locked period
- Cost of capital = 8-12%/year (S&P 500 opportunity cost)
- For collectibles: any hold > 1 year at < 20% ROI is value-destroying vs. index alternatives
- Annualized ROI = `roi × (12 / holdMonths)`. A 3-month hold at 50% = 200% annualized = massive value creation.

**Capital velocity**
Theory: High ROIC businesses don't just earn returns — they recycle capital fast.
Fiddler rule: `daysToExit` is the capital velocity metric. 7-day flip at 30% > 6-month hold at 100%.
Annualized: 30% in 7 days = 1,565% annualized. Display both absolute ROI + annualized in embed.

**DCF applied to sealed TCG**
Intrinsic value of a sealed box = PV(future secondary price × Pr(sell at that price) - hold cost)
Components:
- Future price: ATH × Pr(ATH repeating) + current × Pr(mean revert) — use historical DB comps
- Hold cost: capital × 8%/year + opportunity cost
- Exit window: key input. Strong IP sets have 6-18 month ATH window. Weak sets have 2-4 months.
Fiddler shorthand: if curMult ≥ 1.5× AND set is S/S+ tier AND <12 months old → hold thesis valid.

**Multiples valuation**
Theory: Use comparable companies (comps) to validate DCF → "what multiple does this trade at?"
Fiddler rule: Every embed must show closest DB comps + their current/ATH multiples.
OP13 at 4.33× → comp to OP08 at 7.2× (peak) and OP09 at 4.86× (close comp). State: "trading inline with OP09 early trajectory."

---

## 3. Advanced Positioning Analysis — Keenan (advanced-positioning-sentiment-keenan.pdf)

### Core Principles → Fiddler Mapping

**COT Positioning → eBay sold30/sold90 ratio**
Theory: Track speculative vs structural positions. Rising speculative = trend continuation. Spec covering = reversal.
Fiddler mapping:
- `sold30 / sold90 × 3 = specRatio` (normalizes to monthly rate)
- specRatio > 1.5 = speculators accumulating → momentum signal (bullish)
- specRatio < 0.7 = speculators exiting → mean-reversion signal (bearish)
- specRatio ~1.0 = stable structural demand (buy-hold thesis)

**Flow decomposition (structural vs speculative)**
Theory: Structural demand = always buys (processors, consumers). Speculative demand = price-sensitive.
Fiddler mapping:
- Structural demand = sealed collector base (always buys at release). Sets floor.
- Speculative demand = flippers, resellers. Pushes ATH, then exits. Causes peak/crash cycle.
- ebay active listings spike = speculative supply entering. High active/sold ratio = distribution zone.
- ebay active listings thin = structural demand absorbed supply. Low active/sold ratio = accumulation zone.

**Behavioral patterns repeat until arbitraged away**
Theory: Positioning patterns persist as long as barriers prevent full arbitrage.
Fiddler mapping: TCG reprint = the arbitrage mechanism. Once reprint announced → barrier removed →
speculative positions unwind → price reverts toward retail. Kill switch = reprint news.

**Sentiment lead time**
Theory: Sentiment turns before price (1-2 week lead in commodities).
Fiddler rule: Discord + X sentiment mentions rising before eBay sold velocity spikes = early accumulation signal.
Flag in embed: "Discord buzz ahead of secondary curve" = EARLY indicator.

---

## 4. Trading on Sentiment — Peterson/MarketPsych (trading-on-sentiment-peterson.pdf)

### Core Principles → Fiddler Mapping

**Sentiment regimes (Ch. 22)**
Two regimes:
- Trending: high sentiment + rising price. Momentum strategies work. Buy the dip.
- Mean-reverting: extreme sentiment (euphoria or panic) + price diverging from fundamentals. Contrarian works.
Fiddler mapping:
- Trending regime: `sentimentPts > 5 AND sold30/sold90 > 1.2 AND curMult < ATH×0.7` → hold/accumulate
- Mean-reverting: `sentimentPts > 8 AND curMult > ATH×0.9` → near-top, reduce/exit

**Bubble detection (Ch. 17 "Blowing Bubbles")**
Preconditions:
1. Asset price far above fundamental value (curMult > 4×)
2. Accelerating speculative demand (specRatio > 2.0)
3. Strong positive narrative (Discord/X sentiment > 7/10)
4. Broad retail participation (new buyers entering, not just specialists)
Fiddler rule: IF market > 4× retail AND specRatio > 2.0 AND sentimentPts > 7 → "Late bubble territory.
Position sizing: 50% of normal. Exit plan required within 30 days."

**Bubble top timing (Ch. 18)**
Theory: Bubbles top when sentiment peaks BEFORE price peaks by 1-2 weeks.
Fiddler mapping: If Discord/X mentions declined week-over-week while price still rising = distribution signal.
Sell before the price follows sentiment down. Add "sentiment divergence" to embed signals.

**Fear is more predictive than greed (Ch. 9 "Only Thing to Fear")**
Theory: Panic-driven selling creates better entry signals than greed-driven buying creates exit signals.
Fiddler rule: Strong IP set dipping to near retail (market 1.0-1.3×) = panic-driven entry opportunity,
not a thesis failure — unless fundamentals changed (IP weakened, set reprinted to death).

**Commodity sentiment (Ch. 19)**
Sealed TCG as a commodity:
- Early in commodity cycle: trend-following works. Follow momentum.
- Late in commodity cycle: mean-reversion works. Fade the extreme.
Fiddler mapping: map to release phase:
- 0-3 months post-release: trend-following (buy/hold any spike above 1.5×)
- 3-9 months: mixed regime (hold if S-tier, watch reprint signal)
- 9+ months: mean-reversion (attrition, reprint fully absorbed, thesis for appreciation = IP permanence only)

**"Buy to the sound of cannons, sell to the sound of trumpets" (Rothschild)**
Fiddler rule: Buy when the community is bearish on a strong set (temporary dip, OOS fear, reprint rumor).
Sell when community is euphoric (ATH praise, "to the moon" posts, mainstream attention).

---

## 5. PPS Journal Q1 2022 (pps-journal-q1-2022.pdf)

**Price increase timing**
Theory: Price increases are most effective at launch when demand is inelastic.
Fiddler mapping: Bandai's OP13 MSRP hike ($72→$120) = Bandai capturing consumer surplus at launch.
The real secondary premium is still 4× at $485 — the $120 retail is now the structural anchor.
When modeling future OP sets, use $120 as baseline retail, not $72.

**ROI documentation framework**
Theory: Document ROI across time horizons, not just point-in-time.
Fiddler mapping: embed should show:
- Flip ROI (sell immediately after purchase)
- Hold 3-month ROI projection (based on trajectory comp)
- Hold 12-month ROI projection (regression to DB comp mean)

---

## Actionable Enhancements to Implement in Pipeline

### New metrics to add to embed:
1. **Annualized ROI** = `roi × (12 / estimatedHoldMonths)` — e.g., 3mo hold shows "200% ann."
2. **Speculative Ratio** = `sold30 / (sold90/3)` — above 1.5 = momentum; below 0.7 = cooling
3. **Closest DB Comps** with trajectory — "OP13 @ 4.3× → OP09 peaked at 4.9× @ 5mo, now 2.9×"
4. **Regime Flag** — "Trending" vs "Near Top" vs "Accumulation Zone"
5. **Capital Velocity** — already have `daysToExit`; surface it prominently with annualized ROI
6. **Bubble Caution** — auto-trigger when market > 4× + sold30 accelerating + high sentiment

### New embed sections:
- **Exit Window**: specific dates (reprint window, macro events, trend comp)
- **Kill Switches**: specific events that flip thesis from buy → sell
- **Closest Comps + Trajectory**: 2-3 closest DB comps with their peak/current multiples
- **Demand Drivers**: 3 bullets — structural (base collector demand), speculative (flipper demand), catalyst (upcoming release/event)
- **Scenarios** field: already in prod.scenarios — ensure it's populated for all S/S+ sets
