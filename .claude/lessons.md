# Jester-Researcher Lessons

Standing rule: append `[YYYY-MM-DD] mistake -> cause -> rule` on every mistake. Read before similar work.

- [2026-07-02] DEALERNETX REMOVED FROM PIPELINE (user request, creds already deleted): stripped hwAvg/hwAsk/hwTrend/hwBest/hwTrades/dxTrades/wholesaleFloor/dxQuery/dxProductType from fiddler-research.mjs + lib/deep-research.mjs, removed wholesaleListings/wholesaleSearch/wholesaleByBoxType/DX_BOXTYPES import, removed dealernetx dashboard status + CLAUDE.md pricing-weight line. DX was already stubbed null since 2026-07-01 (account flagged) — this is full removal, not just disable. If DX is ever reinstated, it needs fresh creds in .env (DEALERNET_USER/DEALERNET_PASS) + re-adding to lib/deep-research.mjs track() array + fiddler-research.mjs priceSources.

- [2026-07-02] SPAWNED AGENT TO REBUILD EBAY PLAYWRIGHT SCRAPER: launched general-purpose agent to write fresh eBay scrape for Wallhack mousepad research -> never checked lib/deep-research.mjs first -> ebaySold()/ebayListings() (proxy-rotated, price-banded, already imported in fiddler-research.mjs line 9) already exist and did the job in one node -e call. RULE: before spawning any agent or writing any scraper, grep lib/*.mjs for an existing function first — pipeline helpers are the skillset, not a template to rebuild each time.

- [2026-07-01] WRONG SKU LORCANA SINGLE PACK: used $89.99 for Wilds of Unknown single booster pack (was Illumineer's Trove price) -> never assume pack price from box/trove entry -> ALWAYS verify via TCGCSV catId 71 groupId {tcgId} ProductsAndPrices.csv, match by productId containing "Booster Pack" (not "Box", not "Trove", not "Case"). Single pack productId 678167 = $9.85 market.

- [2026-07-01] CHROME DEBUG SHORTCUT: flags ended up in "Start In" box not Target field -> shortcut error "path not valid" -> RULE: Chrome debug args go in Target field as `"chrome.exe" --flags`, Start In = `"C:\Program Files\Google\Chrome\Application"`. Use PowerShell `WScript.Shell CreateShortcut` to set `.Arguments` separately from `.TargetPath`. Also: `C:\Temp\chrome-debug` must exist before launching.

- [2026-07-01] MONTHLY RECAP @here SPAM: sent @here on every embed (8×) instead of last only -> cause: `content: '@here'` on all send() calls -> RULE: `content` = empty string on all embeds except last; last embed only gets `'@here'`.

- [2026-07-01] TOPPS RELEASE CALENDAR HARD RULE: ALL Topps release dates must be read from https://www.topps.com/release-calendar via CDP real browser. Page JS contains `dropDate` field per product with exact ISO timestamp (e.g. `"url":"/pages/topps-chrome-marvel","dropDate":"2026-07-01T17:00:00.000Z"`). Convert verified ISO string to Unix. Never use product page date alone — calendar is authoritative. USE `topps-calendar.mjs` module (skill: `.claude/skills/topps-calendar/SKILL.md`) — `import { lookupToppsProduct } from './topps-calendar.mjs'` or `node topps-calendar.mjs <slug>`. Module auto-launches Chrome if CDP dead, waits 9s for JS hydration, returns `{ discordTs, unixTs, retail, retailNote }`. If retail unavailable and release > today → retail null + retailNote 'TBA'.

- [2026-07-01] RELEASE TIMESTAMP HARD RULE — NEVER CALCULATE OR GUESS: timestamps must be READ from the source — page JS via CDP, retailer product JSON, or verified date string from the listing. Calculating from offsets is the most dangerous failure mode (wrong year → wrong Discord embed). Topps pages require CDP real browser (localhost:9222); fallback = WebFetch a retailer page (DA Card World, GameStop, Beckett) that lists the date, then convert the verified string. "I calculated July 1 2026 as offset from 2025-01-01" = wrong year. Zero tolerance — if date can't be read from source, ask user before posting.

- [2026-07-01] PRE-SEND SNAPSHOT HARD RULE: NEVER post webhook without (1) DASHBOARD_MODE=1 dry-run, (2) reading the FULL embed payload output in the terminal, (3) verifying every field (rating, market, retail, timestamp, bulkBuy) matches expectations, (4) fixing any discrepancy, THEN sending once. Sending to verify = forbidden.

- [2026-07-01] NO SEND / RED = bulkBuy 0 HARD RULE: if rating resolves to RED or NO SEND, bulkBuy field must be 0 (not a unit estimate). Never show a non-zero bulk buy recommendation on a no-send product.

- [2026-07-01] POKEMON TIER HARD RULE: TL;DR tier = Set Analysis tier ONLY. Never re-derive from ratingResult/forceRating/FORCE_RATING_TIER map. Set Analysis block already computes correct tier from set-scores.json (ipStrength×0.5 + liveDemand×0.3 + pricePerf×0.2). Use `_pokeTierOuter` directly as `_tierLabel`. Re-deriving independently causes repeated tier mismatches between Set Analysis and TL;DR.

- [2026-07-01] `_pokeTierOuter` PRE-COMPUTE MUST USE ipStrengthIndex LOOKUP: pre-compute block used `_me2.ipStrength ?? 50` but set entries don't have `ipStrength` field — it's in `ipStrengthIndex[anchor_char]`. Fallback to 50 → PE score 44 instead of 95 → S showed as A. Fix: inline `ipStrengthIndex` lookup from `_ssRaw2.ipStrengthIndex`. Also: prioritize liveMultiple over activeCount in liveDemand proxy (activeCount ×1.5 gave 69 vs liveMultiple ×0.93 gave 90 for PE).

- [2026-07-01] report-sets.mjs FIELD NAMES WRONG: original script used `.current`/`.ath`/`.firstMonth` on product objects. Actual set-history.json product fields: `.market` (current price), priceHistory array (ATH = max), `.fetchedAt` (date). Also product keys are prefixed (`pitch-black-booster-box` not `booster-box`) — must `find(k => k.endsWith('-' + type))`. Always probe JSON structure before writing field access.

- [2026-07-01] set-history.csv REGION COLUMN ADDED: comp pool now EN-only; JP/KR/CN tagged but excluded. HierRank remapped: 1=SPC/UPC, 2=Display Box, 3=ETB, 4=Collection Box, 5=Bundle, 6=Pack. SPC rows not in set-history.json — must re-append manually after CSV regeneration via report-sets.mjs.

- [2026-07-01] SECRET LAIR NEVER REPRINT (HARD RULE): WotC confirmed Feb 2026 — Secret Lair products are LIMITED PRINT RUN, no longer print-on-demand. NEVER assign reprint risk to any Secret Lair product. Exit window = hold valid for licensed/crossover IP; invest row must NOT say "not advised — reprint risk". `reprintRisk` already returns `'none'` for `isSL` in deep-research.mjs. Exit window + invest row in fiddler-research.mjs updated to reflect no-reprint policy.

- [2026-06-30] HARD RULE — USER-PROVIDED LINKS: if user passes ANY URL in a research request, fetch the full page via https.get() (or Playwright if needed) and read it completely BEFORE writing any product config or running pipeline. Never skip or skim a provided URL. Retail, contents, release date, limits — all live on that page.

- [2026-06-30] RETAIL NULL ON CASIO: set retail:null + retailNote "unconfirmed" because Casio.com appeared WAF-blocked via Playwright — but direct HTTPS node request returned 200 + full HTML with JSON-LD schema containing `price:"270.0"`. Rule: before declaring a retail "unconfirmed", try direct node https.get() — Playwright WAF block ≠ all methods blocked. JSON-LD schema (`priceCurrency/price/priceValidUntil`) is always the fastest retail extraction path.

- [2026-06-30] NEVER USE CURL ON EBAY: eBay blocks all datacenter curl requests (Access Denied / Akamai). Pipeline ebaySold already used headless Playwright but without a proxy — also blocked. Fix: always use headless Playwright + _randomProxy() from proxies-mobilemix.txt for any eBay scrape. Never write ad-hoc curl probes for eBay. Same rule applies to manual investigation scripts.

- [2026-06-30] EBAY QUERY TOO NARROW — KILLS SOLD VOLUME: Pokemon queries prefixed with "Pokemon" + suffixed with set codes (SV10, Mega Evolution, etc.) narrow eBay results → sold30/sold90 return n/a → dollarVolume=0 → liquidity floor misfires. RULE: ALL Pokemon eBay queries = "[set name] [product type]" ONLY. No "Pokemon" prefix, no series codes, no edition suffixes. Applies to every site query (Whatnot, StockX, etc.) for Pokemon products.

- [2026-06-30] FORCRATING MISUSE — WRONG RATING POISONS WRITEUP: pinned `forceRating:'ORANGE'` on dr-etb (S-tier, 177% ROI) because old pipeline had bad data → sent LIGHT SEND on a MEGA SEND product. Rule: `forceRating` is ONLY valid when retail+market are verified but pipeline has a specific data-gap (e.g. dollarVolume=0 from scrape miss). Never use to override a correct engine output. If pipeline data is unreliable and you can't fix the source, output "Lookup Error" — never pin a random rating.

- [2026-06-30] EBAY SOLD DATA MISSING → LIQUIDITY FLOOR FIRES: `sold30/sold90 n/a` → `dollarVolume=0` → liquidity floor at line 1181 caps GREEN/DBLGREEN → YELLOW → tier-floor lifts to GREEN only. Product had real massive volume (49 active listings, 160+ unit bid wall) but scraper returned no sold counts. Fix: when retail+market both verified and product is 6mo+ released with known volume, add `forceRating:'DBLGREEN'` + `retailVerified:true` as pipeline-gap override (not a judgment call).

- [2026-06-28] WRONG-SKU EBAY POISONS BLEND: eBay matching individual packs ($275) instead of box ($1,175) anchored all band guards — excluded StockX, Walmart, DB price. Fix: `_ebayCredible = ebayMedian >= effectiveRetail * 0.7`; when not credible, skip all band guards + exclude eBay from priceSources. RULE: if eBay median < 70% of retail on a sealed TCG box, treat as wrong-SKU; trust DB/StockX/Walmart over eBay.

- [2026-06-28] PCDBPRICE USES .current NOT .market: TCGCSV DBs store price as `p.market`; PriceCharting DBs use `p.current`. The pcDbPrice lookup only checked `p.current` → always null for TCGCSV-sourced MTG/OP/Lorcana DBs. Fix: `_pcVal = p?.current ?? p?.market`. Also add collector-booster-display preference in product key selection over generic booster-box.

- [2026-06-28] SETTEIR OVERRIDES FORCRATING TIER: `writeup.setTier` (DB score → "No Send") was positioned before `_tierLabel` in `const setTier = writeup?.setTier ?? _tierLabel`. Fixed to `_tierLabel ?? writeup?.setTier` so forceRating-derived tier always wins. RULE: `_tierLabel` (forceRating → S+/A/C/No Send) must be first in setTier priority chain.

- [2026-06-28] MTG DB FUZZY MATCH FALSE POSITIVE: `art-series-final-fantasy` matched before `final-fantasy` because `nm.includes(want)` when want=`finalfantasy`. Fix: add `_dbKey` to prod definition + direct `sets[prod._dbKey]` lookup before fuzzy search. RULE: add `_dbKey` to every MTG/One Piece product pointing to its exact set-history DB key.

- [2026-06-28] TIER vs RATING MISMATCH: `forceRating` overrides send label but tier was computed independently from ROI/DB score → DBLGREEN showed "C Tier", RED showed "C Tier" on same product. Fix: `_tierLabel = forceRating_tier ?? _catTier ?? ratingResult.tier` — forceRating always wins tier. Map: DBLGREEN→S+, GREEN→A, PURPLE→A, ORANGE→C, YELLOW→C, RED→No Send. RULE: send label and tier must always be consistent; forceRating drives both.

- [2026-06-28] LEGO DB KEY MISMATCH: `legoSetScore(key)` got null because BrickEconomy backfill stores sets by numeric key (`21350`) while product keys use full slug (`lego-ideas-jaws-21350`). Also fiddler auto-appended entries (no `ath`/`current`) shadowed BrickEconomy entries. Fix: extract trailing numeric, prefer entry with `ath` data via `hasData()` guard. Also `retireExact`/`retiring` status not caught by retired regex — added both. RULE: all categorySetScore functions must handle DB key format mismatches; prefer entries with historical pricing data.

- [2026-06-28] AUTO-APPEND DB HARD RULE: every product researched via fiddler-research.mjs MUST be appended to its category set-history-*.json DB immediately after webhook posts — not staged, not gated on dashboard button. CLI runs bypassed the confirm-db-save gate and silently lost data. Fix: auto-writeFileSync inside the `else` (non-DASHBOARD_MODE) block after SENT. DASHBOARD_MODE still stages for review — confirm-db-save fires on Send. RULE: every pipeline run = DB record, no exceptions, all categories.

- [2026-06-28] PRERELEASE SCOUT SIBLING SORT BUG: `groups.filter(...).slice(-3)` picked wrong sibling sets because TCGCSV returns groups in unspecified order (not by groupId/date). For ME05: Pitch Black, slice(-3) grabbed MEE + promo sets instead of AH/PO/CR. Fix: `.sort((a,b) => b.groupId - a.groupId).slice(0,4)` — always sort by groupId desc before slicing sibling comps. RULE: never rely on TCGCSV group array order; always sort explicitly before slicing.

- [2026-06-28] TCGCSV lowPrice = UPC BARCODES: `lowPrice` field occasionally stores UPC barcodes (e.g. 196214157422) not prices. Must filter with `safePrice(v) = parseFloat(v) > 0 && < 50000`. Also ME01 ETB had corrupted $3000 presale price (not barcode) — additional validity gate: etbMarket < 500 for standard ETB, pcEtbMarket < 1000 for PC ETB. RULE: always run safePrice() on ALL TCGCSV numeric fields before use.

- [2026-06-26] DASHBOARD INLINE JS APOSTROPHE BUG: set names with `'` (e.g. "Kami's Island") broke `onclick="fn('${name}')"` — single-quote inside single-quoted JS string = syntax error, set expansion silently failed. Fix: switch to `data-*` attributes (`data-id`, `data-name`) + read via `this.dataset.*` in handler. RULE: never interpolate arbitrary strings into inline JS string literals — always use `data-*` attributes for values passed to onclick handlers.

- [2026-06-27] SPORTSCARDSPRO SCRAPING: sportscardspro.com (PriceCharting sports sub-domain) returns clean HTML with no CF block when using curl (real TLS fingerprint). node-fetch and Playwright headless both trigger CF "Just a moment". Solution: use `execFile('curl', ['-sL', url, '-A', UA, '--compressed', ...])` — no Playwright/CDP needed. Proxy IPs also trigger CF; direct curl works fine. URL: `https://www.sportscardspro.com/search-products?type=prices&q=<query>`. Table: `#games_table tbody tr`, price in `td.used_price span.js-price`.

- [2026-06-26] eBay DOM changed (2026): `li.s-item` → `li.s-card` (still `li` tag but class `s-card`). Title NOT in `h3` — it's in `[class*="title"]` div or the first `a` link. Price in `[class*="s-card__price"]` or `[class*="price"]`. `domcontentloaded` fires before items render — must `waitForSelector('.s-card, li.s-item', {timeout:8000})`. Skip title === 'Shop on eBay'. Strip "Opens in a new window or tab" / "View similar" from title. Fixed selectors: title=`[class*="title"], h3, .s-item__title` ?? first `a`; price=`[class*="s-card__price"], .s-item__price, [class*="price"]`. Container: `.srp-results .s-card, ul.srp-results li.s-item` with fallback `.s-card, li.s-item`.

- [2026-06-26] SCRAPING EXHAUSTION HARD RULE — NEVER declare site unreachable until ALL combos tried IN ORDER: (1) real browser CDP localhost:9222 headless=false (user's live browser, real IP, real cookies), (2) real browser CDP + each proxy provider rotated, (3) headed Playwright (headless:false) + proxy rotation ALL providers, (4) headless Playwright + proxy rotation, (5) API with real creds (SP-API for Amazon, PA-API, etc.), (6) curl + every proxy pool entry. Headless ALWAYS fails Topps CF Bot Management — Topps = CDP real browser ONLY, never headless. Amazon = SP-API Catalog Items API first (have creds in .env). "Can't access" is forbidden until all 6 exhausted. eBay queries = unquoted parent-set terms not exact slug names — Chrome Disney = "2024 Topps Chrome Disney [character]" not "[full subset name] card".

- [2026-06-26] PRICE SOURCE QUERY RULE — HARD: Every price source query (Walmart, eBay, Amazon, DX, StockX, TCGPlayer) MUST include the PRIMARY product identifier (full game/set/product title) in the search string — NEVER search with only format/edition suffix like "Collector's Edition PS5" or "Booster Box" alone. Generic edition terms match ANY product with that format. Rule: query = "[Full Product Title] [Edition]" always. Validate match by TITLE returned, NOT by URL slug — Walmart URL slugs are stale SEO text and do not reflect the actual product at that item ID. Item ID + returned title = source of truth.

- [2026-06-26] MTG PRODUCT LOOKUP STANDING RULE (took 35min to learn): TCGPlayer IDs for MTG products are NOT contiguous — scan step-1 around known sibling IDs, NOT step-50/100. FF products clustered near 638000-658000 but CBB wasn't on TCGPlayer at all (only pack at 639464). RULE: (1) find one known product in the set (pack, spindown, etc.) via the search API or known range. (2) Scan step-1 in ±1000 window from that ID. (3) If no CBB found after full scan → it's NOT on TCGPlayer; leave tcgId: null. (4) Get MSRP from DDG/Bing search for WPN article: query `"collector booster box" "MSRP" site:wpn.wizards.com OR icv2.com` → confirms $X/pack × 12 = box MSRP. FF CBB: $37.99/pack × 12 = $455.88 (WPN). (5) Market from PriceCharting slug `magic-the-gathering-universes-beyond-{setname}-collector-booster-box` + StockX. (6) Set `forceRating: 'DBLGREEN'` + `forceRisk: '🟢 Low'` when MTG DB shows wrong set-tier. Fix DB entry FIRST so set-tier computes correctly next run.

- [2026-06-25] CHASE CARDS STANDING RULE: For ALL Pokemon/MTG/OnePiece/Lorcana/other_tcg research, pull top 5 chase singles from local set-history DB (`dbChaseCards[]` in fiddler-research.mjs) and surface in market analysis. Chase singles = PRIMARY sealed demand driver — a $558 Mewtwo ex in a set means buyers crack boxes chasing it; live DB prices ground the thesis. Auto-cat block must detect `pokemon` from label (elite trainer/booster box/set names) before `noncard` fallback or DB lookup is skipped. Without this, Pokemon products without explicit `category:'pokemon'` miss the DB lookup entirely.

- [2026-06-25] DELIVERY GATE RULE: editing a file on disk ≠ delivering to user. Dashboard has `delivery-gate.js` hook that checks `GET /api/version` → `stale` field. If `stale=true`, running server is serving old code. Always run `restart-dashboard.ps1` after ANY edit to dashboard-server.mjs or index.html; confirm `stale=false` before claiming done. Never say "done/fixed" until the live process serves the change.

- [2026-06-25] Burned a session guessing tcgcsv.com download paths (`/categories/{id}/groups.csv` → 404, then concluded "only Categories.csv exists, API required/broken") before reading the site's own index page (tcgcsv.com/#information-tiers). REAL structure: navigation JSON `/{cat}/groups`, DATA per group `/{cat}/{groupId}/ProductsAndPrices.csv` (the `.csv` suffix is mandatory — without it the SAME path returns XML NoSuchKey, which was the original "API returns XML" red herring). groupId === set.tcgId. The ProductsAndPrices.csv has quoted MULTI-LINE fields (extCardText) so a naive line.split('\n') corrupts every row → must use RFC-4180 state-machine parser. RULES: (1) READ a data source's own index/docs page before guessing URL schemes. (2) any TCGplayer-derived CSV needs a real quoted-field parser, never split. Full Pokemon pull = 212 sets / 40,779 cards / 3,115 sealed, date-stamped priceHistory.

- [2026-06-24] HARD RULE — ALWAYS APPEND DB: every product request must persist ALL newly-found data (scraped prices, eBay sold median+count, market, ROI/tier/rating, verified MSRP, AND full writeup market/product/priceComp/supplyDemand/recs) into the correct category `set-history-*.json` — first check, every run, no exceptions, append-not-overwrite, date-stamped. FIX: build universal `appendToCategoryDB(prod,signals,market,rating,writeup)` upserting into set-history-<category> for every category.

- [2026-06-24] NEVER `if category==X then prose` — analysis must be product-specific + data-driven (from prod fields, scraped contents, authored writeup.product, handbook product-ranges). Product Analysis now pulls per-SKU writeup.product or flags RESEARCH REQUIRED.

- [2026-06-24] Historical projection reads per-vol records from set-history-*.json (each vol's first/ath/current/curve), computes per-vol multiples + range + trend, projects the new SKU off that — deterministic, not a flaky live blend.

- [2026-06-23] HARD RULE — DELIVERY GATE: NEVER say done/fixed/synced/updated until the change is LIVE in the process the user touches: ensure exactly ONE instance running with `--watch`, kill stale/dupe procs, restart/confirm reload, then hit the live endpoint and verify output matches the ASK. LOOP UNTIL CORRECT autonomously — never hand the verification loop back to the user.

- [2026-06-23] HARD RULE — NEVER GUESS, EVER: if I don't know, say "I don't know" + investigate; never ship a guessed/hedged value, MSRP, schema, or field. No "~$X unverified"/"probably"/"should be" outputs.

- [2026-06-23] EB-01 Memorial Collection: sent 3 wrong webhooks instead of verifying THEN sending once. RULES: (a) ALWAYS run `DASHBOARD_MODE=1` dry-run, eyeball Market/Rating/ROI for plausibility, fix every source, THEN send the single final webhook — never send to verify. (b) every price source needs an eBay-band sanity guard before the blend (eBay sold = authoritative anchor). (c) when 3 sources agree and ONE disagrees, the outlier is wrong — never let it move the blend. (d) eBay scrape must respect the "N results" count heading; raw `li.s-item` count includes supplemental junk.

- [2026-06-23] Discord = intel input only, never quoted/attributed in writeup fields. Synthesize from pipeline data only.

- [2026-06-23] `ONEPIECE_RETAIL['booster-box'] = 120` used as retail for ALL One Piece sets — constant overrides per-set value. RULE: always put per-set DB value first: `set.retail ?? ONEPIECE_RETAIL[type] ?? fallback`. Never let a global constant override a specific per-record value.

- [2026-06-23] TCGPlayer product IDs from `tcgProductSearch` can match wrong products (display cases, Japanese sets). RULE: before trusting TCGPlayer price, compare to eBay sold median. If TCG > eBay×2, wrong SKU. eBay sold (price-banded, 30d median) is the authoritative price floor.

- [2026-06-23] ALWAYS separate display enforcement from internal scoring. Display (profit/ROI shown to user) requires verified data; scoring (internal rating) uses best available signal even unverified. Add `_scoringRetail`/`_scoringCostBasis`/`_scoringRoi` for rating; never let a display gate degrade the rating engine.

- [2026-06-23] Never calibrate scoring scales to statistical outliers. 4× ATH sustained is real S-tier for One Piece; scale should be `(athMult-1)/3` (0=1×, 100=4×). Set 100 at the 90th-percentile ceiling, not the all-time record.

- [2026-06-23] Always add null fallback before comparison operators — `null >= 40` = false but `null < 15` = false too, so a null can skip ALL branches and hit an unexpected default. Use `const _safe = val ?? fallback` before any comparison chain.

- [2026-06-22] YouTube video rule: any video link = pull the real transcript before commenting. Working method = `python -m pip install -q yt-dlp` then `python -m yt_dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o out.%(ext)s "<url>"`, then strip VTT (dedupe lines, drop timestamps/&gt; markers) → clean text.

- [2026-06-22] For premium/high-end/EQL sports comps use REAL collector products — Topps: Dynasty, Definitive, Five Star, Tier One, Chrome Sapphire, Bowman Chrome (rookies); Panini: National Treasures, Flawless, Immaculate, Definitive. Never anchor a sports-card thesis to a celebrity/IP crossover collab.

- [2026-06-22] Topps Chrome Baseball: read intel channels + pull full price-curve + live cost BEFORE writing. Chrome flagship Baseball = flip release-week only (drops before The National = short prop), no hold. Discord GET /messages/{id} 403s even w/ access — use `?around={id}` to read.

- [2026-06-22] HOBBY = no-reprint hold thesis (fixed run); retail/value = flip-only flood. Appreciation GATED on rookie class — fixed supply alone won't lift a weak year. For presale forward Topps, comb eBay + StockX + retailer presale (D&A/steelcity/blowout/midwest) for presale market. Gate TCGplayer auto-fetch to Pokemon/MTG only.

- [2026-06-22] APPEND every newly-found/posted set to its category DB forever — date-logged, never overwrite. COMPARE every new find against existing DB inside the writeup (rank vs peers, name closest comps, state stronger/weaker + why) — never analyze a set standalone. LEGO sources: brickfanatics.com (retirement intel) + brickeconomy.

- [2026-06-21] LEGO pricing mechanic = RETIREMENT scarcity — sets in production sit AT/BELOW retail (pre-EOL discount), only appreciate AFTER retirement. eBay median BLENDS sealed-new + used/loose — investable comp is NEW-SEALED (BrickEconomy "new" value). Check retirement status (BrickEconomy "retiring soon"/EOL date) — it's the single biggest LEGO price driver.

- [2026-06-21] PARSING RULE: eBay `sold30/sold90` counts on a NOT-YET-RELEASED product = presale-ask / wrong-SKU noise — check releaseDate first; if unreleased + no verified sealed solds, set `preRelease:true`. Scraped market median must be the SAME SKU as the retail anchor.

- [2026-06-21] prod.sellThrough Flip/Hold/Invest ranges MUST match the Market+Product analysis + pricing mechanic. Capped-supply/scarcity items ladder UP. No-scarcity/mass-produced/restocked commodities do NOT — Flip-NOW is the play.

- [2026-06-21] For PRE-RELEASE/forward products with no verified sealed SOLD comps, set `preRelease: true` — it nulls market + suppresses ROI/profit/Market-Range so the embed shows the projection writeup ONLY. Retail anchor and scraped market MUST be the same SKU.

- [2026-06-20] Secret Lair = limited print run (WotC confirmed Feb 2026, NEVER returning to print-on-demand) = real sealed scarcity (sealed can appreciate, two exits: crack-for-single or hold sealed). Don't recite product-model facts from memory — verify current print model before analyzing any TCG product line.

- [2026-06-19] Category gate: `isPokemon = prod.category==='pokemon'`. Set Analysis (🆚) + setScore persistence + MARKET_PULSE = POKEMON ONLY. Non-Pokemon uses authored `writeup.market` + category-neutral live lines. Three triggers: "Research Pokemon:" (set DB + socials), "Research Topps:" (sentiment + all pricing APIs + ODDS calc), non-card (eBay/Amazon/Walmart primary + X/Discord/Google/FB/IG).

- [2026-06-19] Every `writeup.market` must SYNTHESIZE — compare to comparable products, state WHY it does well or poorly, name the risk that caps it. Facts are inputs, not the output.

- [2026-06-19] Any product never seen before MUST run `node fiddler-research.mjs <key>` (full deepResearch). No shortcut probes, ever.

- [2026-06-19] 3P (Amazon/Walmart) price must be ≤ `ebayMedian×1.5` (or retail×3 if no eBay) else it's a wrong-product match; StockX dropped if (ask-bid)/bid > 50% OR price > ebayMedian×1.5. eBay SOLD median (real volume) is the trusted anchor.

- [2026-06-19] If a job must run detached (no completion callback), KEEP a ScheduleWakeup re-armed every turn until the status file shows _allDone, and proactively announce completion/failure the moment the poll sees it. Don't rely on the user to ask "status".

- [2026-06-19] Verify a background job is alive by matching CMDLINE (`Get-CimInstance Win32_Process | Where CommandLine -like '*script*'`), never bare process-name count. Check log file MTIME — stale mtime = dead/hung.

- [2026-06-19] If a source rate-limits ONCE, treat the whole job as rate-limited — run sequential, never fan out concurrent scrapers. Every status snapshot MUST compare counts to the PRIOR snapshot; frozen counts + live procs = stall, kill+rerun immediately.

- [2026-06-19] 403 on `/channels/{id}/messages/{msgId}` = that message isn't in that channel (wrong ID / it's a DM), NOT a permissions/token problem. Verify channel access with `/messages?limit=1` before blaming the token. Posting uses webhook 1516299027161944155, not the token.

- [2026-06-19] Gate `productTypeTier` (Display>ETB>Bundle>Blister = Pokemon sealed formats) to `isPokemon` only; never run Pokemon-format detection on non-Pokemon labels. Market analysis = 3 labeled bullets **Thesis / Liquidity / Risk** (Thesis merges scarcity+why-it-runs), no pricing reiteration.

- [2026-06-19] Confirm understanding by DOING, not by asking. State assumptions in one line, act, surface only genuine blockers (and self-serve those first).

- [2026-06-24] HARD RULE — TEST BEFORE BACKFILL: ALWAYS probe the target URL first (curl -I, check HTTP code, verify HTML structure) BEFORE writing any scraper. If site returns 429/403/Cloudflare immediately, stop — don't iterate regexes. Test infrastructure FIRST. Solution: proxy rotation (350 pools, rotate per request) bypassed rate-limit; backfill-proxies.mjs working.

- [2026-06-24] rerun-with-feedback PRESERVES all embed fields (never truncate). If pipeline drops a section, SHOW what was removed + why. ALWAYS compare before/after — show user what changed between runs, especially losses.

- [2026-06-24] ZERO hardcoded search terms. ALL queries built dynamically at runtime from prod.label / prod.set / prod.writeup fields. NEVER output "RESEARCH REQUIRED" / "TBD" / empty placeholder text in final embed. Fiddler = RESEARCH BOT — mandate is to RESEARCH.

- [2026-06-16] Fiddler ALWAYS runs the full pipeline. Never write ad-hoc probe scripts for market comps. If a product isn't in the products map, ADD it and run the pipeline.

- [2026-06-16] When adding a new product to the map, ALWAYS write the full writeup (market, product, priceComp, supplyDemand, recs) from the pipeline data + Discord intel before running. No empty strings, no TBD.

- [2026-06-17] NEVER output a value with "unverified"/"verify before using"/any hedge. Re-query first, output confirmed value only. If truly unfindable after exhausting all sources, say "could not find" + sources tried — never ship a guessed number.

- [2026-06-17] When Discord provides a TCIN/URL/SKU, IMMEDIATELY WebFetch that URL to confirm retail price, contents, availability. Validate every claim against the actual retailer page before outputting. Discord = signal; retailer page = fact.

- [2026-06-17] Amazon/Walmart prices BELONG in the embed (retail vs market is the whole point); the only rule is never post to 1501599895360897328 (snailbot's channel). DealernetX is the only source that must stay out of embed entirely.

- [2026-06-17] Fiddler posts ONLY to 1516298588261585097. Never post to 1501599895360897328 — that is snailbot's own system.

- [2026-06-17] TIER LABELS: GREEN = 🟢 FULL SEND | DBLGREEN = 🟢🟢 MEGA SEND | ORANGE = 🟠 LIGHT SEND | RED = 🔴 NO SEND. No variations.

- [2026-06-17] "Still on shelves" fires ONLY when price ≤ retail × 1.02. Scalper price on Amazon ≠ retail availability. retailInStock Amazon/Walmart requires price ≥ retail × 0.8 AND ≤ retail × 1.02.

- [2026-06-17] MARGIN LABELS: ≥1.5× = healthy margin | ≥3× = scarcity premium | <1.5× = margin compressing.

- [2026-06-17] Retail field = price only. Market field = price only. No source notes, no retailer names, no OOS text in those fields. Market Range = "$low — $high" only, no sales velocity count. Bulk Buy = tier count only.

- [2026-06-17] Supply/Demand = market forces only (scarcity mechanics, demand signals, historical comps, absorption rate). Never list SKUs/TCINs/channel names in Supply/Demand.

- [2026-06-17] Retail price lookup order: (1) retailer direct page, (2) Bulbapedia product wiki, (3) DealernetX listing, (4) eBay description scan. Exhaust ALL before declaring unconfirmable.

- [2026-06-17] Never mangle user-provided product strings for DX search. Always add a `dxQuery` field to products using the shortest unambiguous DX search term.

- [2026-06-22] Never use sed for price patching in multi-field data blocks; use Edit tool with exact old_string/new_string containing full context. Sed is not safe for structured data with repeated digit patterns.

- [2026-06-22] BrickEconomy = curl only, never node fetch/WebFetch. Use `--max-time 25 --connect-timeout 12` to prevent hang. Always use `parseFloat(String(s).replace(/[,$]/g,''))` not `+()` for scraped numeric strings.

- [2026-06-22] For any sports-card product with no live eBay/SportsCardsPro data, run `python -m yt_dlp "ytsearch12:<product> hobby box break" --print "%(id)s|%(duration)s|%(title)s" --no-playlist` to surface breaker intel; pull VTT from top 3 most relevant.

- [2026-06-22] Render dedup strips Bear/Base/Bull lines from writeup.product BEFORE appending prod.scenarios: `.filter(l => !/^\s*\*{0,2}(Bear|Base|Bull)\*{0,2}\s*[\(:]|Prob-weighted/i.test(l))`. Don't put Bear/Base/Bull in both authored text AND prod.scenarios.

- [2026-06-22] For any sports-card product, ALWAYS check (1) Blowout Forums thread (WebFetch/WebSearch blowoutforums.com "<product> break" or "<product> review"), (2) YouTube break videos via yt-dlp search. These are PRIMARY pre-release evidence sources for sports.

- [2026-06-23] Guild ID ≠ channel ID. Use `/guilds/{guildId}/channels` to enumerate real channel IDs; never pass a guild ID to `/channels/{id}/messages`.

- [2026-06-23] Before sending ANY embed, run DASHBOARD_MODE=1, read full embedPayload, verify retail/market numbers are plausible for the ACTUAL product. If eBay median is 10-20× expected retail → wrong SKU.

- [2026-06-23] When pipeline produces wrong-SKU/wrong-product data, fix it immediately (ebayQuery, retail, preRelease in dynamic-products.json) before sending. Never outsource obvious data corrections to the user.

- [2026-06-23] Blowout Forums = Playwright only (real Chromium). Node.js fetch/curl cannot bypass Incapsula TLS fingerprinting without curl-impersonate. Cookies are in .env as BLOWOUT_*.

- [2026-06-23] StockX is checked FIRST for MSRP. stockxMarket() returns msrp field from catalog hit; pipeline auto-fills prod.retail from stockx.msrp when retail is null. MSRP lives in `hit.productAttributes.retailPrice` NOT `hit.retailPrice`. NEVER hardcode TCG retail.

- [2026-06-23] A backfill is only DONE if scanned-count INCREASED or rows>0; "0/N with data" = FAILED, alert + don't mark complete. Before trusting any PriceCharting re-crawl, probe one product page for `chart_data` presence.

- [2026-06-23] When adding a dynamic product, set category to the REAL category, pull retail from the category set-history DB, and set preRelease=false if the DB/eBay shows real sold volume. Never leave TBD/"unreleased" placeholders on a released product.

- [2026-06-23] Every price source needs Number.isFinite + eBay-band sanity before entering weighted blend. DX One Piece query = set name only (NO "Box" → 0 results). DX often returns JP unlimited = wrong region, must not blend into English market.

- [2026-06-23] Profitability fields must FALL BACK to _scoringNetProfit when display net is null, never emit 'N/A'. Pre-drop products MUST use forceRating (DLOM off garbage liquidity is meaningless). When retail sourced from a real retailer item#, set retailVerified:true.

- [2026-06-25] DYNAMIC STUB POISON: never trust dynamic-products.json key without checking score against static map first; audit stubs periodically. Frontend auto-select score≥45, server n-gram guard score≥25 returns 409+best match.

- [2026-06-25] tcgProductSearch UNRELIABLE for MTG: after ANY tcgProductSearch for MTG/Lorcana, verify productName via `mp-search-api.tcgplayer.com/v2/product/{id}/details`. For new products: scan ID range around known sibling IDs. Hardcode verified tcgId in static map immediately.

- [2026-06-25] For ANY MTG product, URL is the only reliable anchor. When user provides a product URL, WebFetch it immediately to extract exact product title BEFORE building any config or running pipeline. Title from Amazon page = ground truth.

- [2026-06-25] EMBED FIELD RULES — 5 standing rules: (1) Set Analysis 2nd bullet = top chase card from dbChaseCards[0] for ALL TCG+sports. (2) Remove Catalysts + Demand Drivers from embed output; synthesize into market thesis only. (3) Field order: Scenarios → Closest Comps → Exit Window. (4) DBLGREEN bulk buy = 250+ default; only override prod.bulkBuy for hard structural caps. (5) DBLGREEN/GREEN rating → 🟢 Low risk default unless forceRisk explicitly overrides.

- [2026-06-26] TCG DB EXPANSION STANDING RULE: Every major TCG game on TCGPlayer has its own TCGCSV category ID. Each game gets its OWN set-history-<game>.json DB — NEVER lump unrelated games into other-tcg. Known categories: 1=MTG, 2=YuGiOh, 3=Pokemon, 16=Cardfight Vanguard, 20=Weiss Schwarz, 27=Dragon Ball Super, 62=Flesh & Blood, 63=Digimon, 68=One Piece, 71=Lorcana, 77=Sorcery, 79=Star Wars Unlimited, 80=Dragon Ball FW, 81=Union Arena, 86=Gundam, 87=hololive. Refresh: `TCG_CATS=<id> node tcgcsv-csv-fetcher.mjs`.

- [2026-06-26] TCGCSV REFRESH PIPELINE: (1) `TCG_CATS=<catId> node tcgcsv-csv-fetcher.mjs` → populates fullCardList + sealed products + priceHistory per set. (2) Run chaseCards derivation node script (top 5 by market, skip tokens/emblems/basics). (3) Sort DB by release date desc. All 3 steps required.

- [2026-06-16] AH ETB: verify retail from Discord intel channels or direct product page, never from search snippet. 80% tone-down rule ONLY applies to ORANGE/weak plays — DBLGREEN plays with tight supply + strong IP need aggressive estimates (50-200+ units). Match aggression to signal strength.

- [2026-06-16] Fiddler writeups = facts + data only. Retail, market, margin, supply, risk. No cheerleading, no validating. Numbers speak for themselves.

- [2026-06-16] When user shares a snowflake ID in context of a known channel, call `/channels/{known_channel_id}/messages/{snowflake}` first; only escalate to "no access" after trying the correct endpoint.
