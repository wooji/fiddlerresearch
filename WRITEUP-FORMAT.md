# Fiddler Writeup Format
> **Captures:** BCG/McKinsey analyst standard, Thesis/Liquidity/Risk bullet format, Bear/Base/Bull prob-weighted scenarios, what NOT to write, corrections flow via `_userNotes`.
> **See also:** `EMBED-FORMAT.md` (how writeup renders in Discord) · `PRICING-MECHANICS.md` (frameworks to draw from)

## Standard: BCG / McKinsey / Goldman Sachs Level
You are a professional market analyst. Every writeup must SYNTHESIZE — not recite facts.
State WHY someone should buy vs alternatives. Name comps. Give numbers. State the risk that caps it.

## Market Analysis Field — 3 Bullets Exactly

```
• **Thesis — [label]:** [specific claim with numbers, why this vs comparable products]
• **Liquidity:** [velocity + sentiment + floor/ceiling data]
• **Risk:** [structural risk that caps the thesis]
```

### Thesis Label Examples
- `Thesis — OOS:` when product is out of stock at retail
- `Thesis — retail still active:` when still on shelves
- `Thesis — pre-release:` when not yet live on secondary
- `Thesis — declining:` when market is compressing

### Thesis Must Include
- eBay median price + multiple vs retail
- Sold velocity (sold/30d)
- Why THIS product vs comparable (e.g. "3× a standard Chrome NBA box on Travis Scott brand")
- The mechanism driving the price (scarcity, IP, reprint, OOS, etc.)

### Liquidity Must Include
- Velocity: "229 sold/30d on eBay" — never omit if data exists
- Trend: "floor established", "price rising", "compressing"
- Buy window signal: "buy window narrowing" / "still accumulating"

### Risk Must Include
- The ONE structural risk that kills the thesis (reprint, restock, bad RC class, etc.)
- Never generic ("market could go down") — name the specific mechanism

## Product Analysis Field

```
• **Config:** [Product Name Title Case] · $X.XX MSRP · [in stock / OOS] at retail.
**Bear** ([bear scenario label]): **~$X** (≈MSRP).
**Base** ([base label]): **~$X** (X×).
**Bull** ([bull label]): **~$X**.
Prob-weighted ≈ **$X**.
```

### Bear/Base/Bull Labels
- Bear: what causes floor (retail restocks, weak demand, reprint, bad RC)
- Base: what sustains secondary (OOS holds, moderate demand)
- Bull: what accelerates (OOS extends, strong RC, viral IP moment)

### Prob-weighted Formula
`bear × 0.25 + base × 0.55 + bull × 0.20`

## Corrections (USER_NOTES) — Claude CLI Synthesis
When user enters corrections in dashboard:
1. Structured overrides parsed first (retail, amazon, walmart, ebay, market price overrides)
2. `claude -p` spawned with signals + corrections → writes the 3-bullet format above
3. Output replaces auto-gen entirely
4. Falls back to template if Claude spawn fails

Corrections = treated like a direct analyst instruction. Never just append as a footnote.

## What NOT to Write
- "Sure, here is the analysis..."
- Generic risk ("market could change")
- Pricing reiteration in the writeup (prices are in the top fields)
- "Understood?" / asking for confirmation
- Cheerleading ("full send!", "everyone should max")
- Filler words (just, really, basically, actually)

## Auto-Gen vs Authored
- `writeup.market` stub (/pending|TBD/i) → auto-gen from signals
- `writeup.market` authored text → use verbatim (analyst wrote it)
- `prod._claudeMarket` (from corrections) → takes priority over both
