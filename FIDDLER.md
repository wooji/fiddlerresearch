# Fiddler Research — Master Index

**Resume entry point.** Read this table first every session. Each doc owns a specific slice of logic — nothing is duplicated.

| Doc | Status | Captures |
|-----|--------|----------|
| `FIDDLER.md` | ✅ current | Master index + search query rules, product tiers, pipeline architecture, known blockers |
| `RATING-LOGIC.md` | ✅ current | Send rating matrix (MEGA/FULL/LIGHT/NO SEND), $10k capital deployment framework, DLOM, days-to-exit, tier-to-rating mapping |
| `EMBED-FORMAT.md` | ✅ current | Exact Discord embed field order/format, TL:DR structure, forbidden labels, verify-before-send checklist |
| `WRITEUP-FORMAT.md` | ✅ current | BCG/McKinsey analyst standard, Thesis/Liquidity/Risk bullet format, Bear/Base/Bull prob-weighted, what NOT to write |
| `PRICING-MECHANICS.md` | ✅ current | Nagle & Müller (pocket price waterfall, EVC, lifecycle), Pratt valuation (DLOM, 3 approaches), Graham (Mr. Market, MoS, investment vs speculation), PPS inflation pass-through levels |
| `DATA-QUALITY.md` | ✅ current | Wrong-SKU detection thresholds, sanity gates (price floor/ceiling), corrections flow (`_userNotes` → `claude -p`), verify checklist |
| `CATEGORY-MECHANICS.md` | ✅ current | Per-category rules: One Piece/Lorcana/Sports/MTG/LEGO/Noncard — retail anchors, reprint risk, hold thesis, eBay query format |

---

## How Fiddler Works
- `fiddler-research.mjs <product-key>` — runs deep research pipeline, posts Discord embed
- `dashboard-server.mjs` — web UI at `http://localhost:3434` for review before sending
- `DASHBOARD_MODE=1` — skip auto-post, wait for user to click Send in dashboard
- Products defined in `fiddler-research.mjs` PRODUCTS map + `dynamic-products.json` for user-created entries
- `lib/deep-research.mjs` — 16 concurrent sources via `Promise.allSettled` + `track()` for live SSE logging
- `lib/query-builder.mjs` — `buildQueryVariants(prod)` generates smart per-category search terms

---

## Search Query Rules (HARD RULES — enforced in query-builder.mjs)

### General Rule
Strip packaging/format words. Keep BRAND + SET NAME + YEAR only.
If first query returns 0 results → try next variant. NEVER return 0 — there is ALWAYS data on anything.

### Pokemon TCG
- Parse SET NAME only. Drop: "Pokemon TCG", "Trading Card Game", "Booster Box", "ETB", "Elite Trainer Box", "Hobby", "Sealed"
- Primary: `pokemon <set name>` (e.g. `pokemon pitch black`)
- Also search: `pokemon tcg <set name>`, `pokemon <set name> booster box`, `pokemon <set name> etb`
- Reddit: `pokemon <set name>` scoped to `r/pokemontcg`
- X: `pokemon <set name>`

### Sports Cards
- Parse: YEAR + BRAND-SHORT + SET NAME. Drop: "Hobby Box", "Booster", "Baseball/Basketball/Football" (add back only if needed for disambiguation)
- Short form: drop brand if set name is unique enough (e.g. `2026 Chrome Baseball` not `2026 Topps Chrome Baseball`)
- Tiers (MUST understand for writeups):
  - **Hobby Box** — hobby shop only, fixed print run, appreciates with strong rookie class, 1.3–1.8× resell
  - **Jumbo/HTA Box** — fewer boxes per case, more autos/relics, 1.2–1.6×
  - **Blaster Box** — Target/Walmart, continuous restock, 0.8–1.0×, flip only on OOS spike
  - **Hanger Pack** — $10, commons only, no secondary value, skip
  - **Mega Box** — Target-exclusive, slightly better hits than blaster, 0.9–1.1×
  - **Fat Pack/Cello** — bulk, no premium cards, skip
- Reddit: `<year> <set name>` e.g. `2026 chrome baseball`
- YouTube: `<year> <set name> hobby box break`

### Magic: The Gathering (MTG)
- Parse SET NAME. Drop: "Magic The Gathering", "MTG", "Play Booster Box", "Collector Booster Box", etc.
- Search variants: `magic <set name>`, `magic the gathering <set name>`, `mtg <set name>`
- Add product type for disambiguation: `magic <set name> collector booster`, `secret lair <set name>`
- Product tiers (MUST understand for writeups):
  - **Collector Booster Box** — 12 packs, $324 MSRP, 100% rares, exclusive foil treatments. 0.5–3.0× (crossover IP peaks 2–4×)
  - **Play Booster Box** — 30 packs, $210 MSRP, draftable. 0.8–1.2×, trends below MSRP month 2+
  - **Bundle** — 9 Play packs + basics, $70, 0.9–1.0×, neutral
  - **Gift Bundle** — 9 Play + 1 Collector, $90, 0.9–1.1×
  - **Commander Deck** — 100-card precon, $50, 0.9–1.2×
  - **Secret Lair** — LIMITED PRINT RUN (not POD since Feb 2026), 3–7 cards, $30–50, 1.5–4× sealed hold
  - **Prerelease Kit** — 6 Play + promo foil, ~$32, event-only, no premium
  - **Jumpstart Box** — 24 half-decks, $132, casual, 1.0–1.1×
- Reddit: `magic <set name>` scoped to `r/magicTCG`

### Disney Lorcana
- Parse SET NAME. Drop: "Disney Lorcana", "Lorcana", "Disney", "Booster Box", "Booster Pack", "Blister", "Starter"
- Search variants: `lorcana <set name> booster box`, `disney lorcana <set name>`, `lorcana <set name>`
- Sets (Chapters 1–8):
  - Ch1: The First Chapter | Ch2: Rise of the Floodborn | Ch3: Into the Inklands
  - Ch4: Ursula's Return | Ch5: Shimmering Skies | Ch6: Azurite Sea
  - Ch7: Archazia's Island | Ch8: Wilds of the Unknown (released 2025-05-09)
- Product tiers:
  - **Booster Box** — 24 packs × 9 cards, $120 MSRP, PRIMARY flip target, 1.2–1.8×
  - **Single Booster/Blister** — $6, track only if box OOS
  - **Starter Deck** — $15, gameplay, low secondary, avoid
  - **Illumineer's Trove** — 4 packs + accessories, $30, 1.1–1.5×
  - **Gift Set** — 4–8 packs + promos, $30–50, 1.0–1.4×
- Reddit: `lorcana <set name>` scoped to `r/Lorcana`
- Reprint risk: Disney/Ravensburger has reprinted every prior set within 6 months. Cap invest thesis.

### LEGO
- Search: `lego <set number>` as primary (5-digit set number is most precise)
- Secondary: `lego <theme> <set name>`
- BrickEconomy = primary price source (requires curl, NOT node-fetch — Cloudflare blocks)
- Retirement status is #1 price driver: active sets sell at/below retail; appreciate post-EOL

### Vinyl / Collectibles
- Strip edition/format words, keep artist + album + variant
- Search: `<artist> <album> <variant>` (e.g. `taylor swift toy story vinyl`)

---

## Sentiment Sources — ALL TCG Products (not just sports)
- **YouTube**: enabled for pokemon, mtg, lorcana, other_tcg, sports. Queries: `<set name> booster box opening`, `<set name> box break`
- **Blowout Forums**: enabled for ALL TCG. URL: `blowoutforums.com/showresults.php?ps=1&q=<query>`
- **Reddit**: blocked at IP level — needs `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` in .env. Create at reddit.com/prefs/apps (script type app)
- **Discord**: channels 722968137687105596, 1348649989781585991, 1247959380704366753

---

## Dashboard Architecture
- Port 3434, `dashboard-server.mjs`
- SSE stream: `POST /api/research` → streams `event: log` lines as each source completes
- `track()` in `lib/deep-research.mjs` logs `[source] fetching…` immediately, then result/error when settled
- `parseLiveLine()` in `dashboard/index.html` maps log lines → checklist dot updates via `LINE_PATTERNS`
- `buildQueryVariants(prod)` from `lib/query-builder.mjs` passed as `opts.queryVariants` to `deepResearch()`
- `tryVariants(fn, isEmpty, variants[])` — tries each variant until non-empty result, logs fallback

---

## Key Files
- `fiddler-research.mjs` — main pipeline, PRODUCTS map, embed builder
- `dynamic-products.json` — user-created products (auto-created from dashboard)
- `lib/deep-research.mjs` — all 16 sources, track(), tryVariants(), deepResearch()
- `lib/query-builder.mjs` — buildQueryVariants(), SPORTS_TIERS, MTG_TIERS, LORCANA_TIERS, LORCANA_SETS
- `lib/prices.mjs` — TCGPlayer, BestBuy, Target pricing
- `lib/stockx.mjs` — StockX market data
- `dashboard-server.mjs` — HTTP server, SSE, webhook history, Discord channel proxy
- `dashboard/index.html` — full dashboard UI
- `webhook-history.json` — per-send log with Green/Yellow/Red ratings
- `.env` — all API keys (eBay, Walmart, Amazon SP-API, X, Instagram, Facebook, StockX, Dealernet, Discord)

---

## Known Blockers / TODOs
- **Reddit OAuth**: IP-blocked without credentials. Add `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` to .env
- **StockX sanity check**: prices > retail×5 with no volume = wrong match, should be nulled
- **YouTube scraping**: links shown, actual transcript pull not wired for non-sports
- **Blowout scraping**: links shown, actual scraping not wired
- **ebay-active vs ebay-sold**: both use key `ebay` in liveState — second one overwrites first in checklist dot. Fix: separate keys `ebay-sold` and `ebay-active` in PRICING_KEYS
