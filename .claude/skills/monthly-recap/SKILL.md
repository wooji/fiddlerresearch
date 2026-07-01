# monthly-recap

Write and post the Monthly Vision Recap — a multi-embed Discord summary of all resell research from the past month.

## When to use
- End of each month (or when user asks for recap/state of the union)
- Covers: Pokemon, One Piece, MTG, Lorcana, Sports Wax, Collectibles/Toys, LEGO, forward look

## Destinations
- **Vision channel** (personal recap): `https://discord.com/api/webhooks/1521942587697660131/tYqfaEcMC_wvRRs238qXFxTT0ZRVVGy03w2ylp_PchpKF2JaMIkP7o2HdUarUv764-NZ`
- **Fiddler channel** (shared research): `EXTERNAL_WEBHOOK_URL` in `hook-reader/.env` → channel `1516298588261585097`

## Workflow

### 1. Pull source data
- Read all webhooks Fiddler sent this month from channel `1516298588261585097` using Discord user token
- Read Xenith intel channels: `862416675873751050` + `1247959380704366753`
- Read all set-history-*.json DBs for verified pricing (market, retail, multiple)
- Cross-reference pipeline-results.json for ratings

### 2. Build content
- Group by category: Pokemon → One Piece → MTG → Lorcana → Sports → Collectibles/Toys → LEGO
- Per product line: `Retail | Market | Multiple | Rating emoji`
- Forward look: next month's confirmed drops with timestamps from `topps-calendar.mjs` for Topps products
- Upcoming Pokemon: from set-history.json releaseDate fields
- Write in user's voice — direct, data-driven, no cheerleading, no filler

### 3. Format (Xenith embed style — HARD)
Each category = ONE embed. Rules:
- `content`: empty string for all embeds EXCEPT the last → last embed content = `'@here'`
- `color`: `0x57F287` (Discord green)
- `title`: emoji + category + " — [Month] Recap"
- `description` structure:
  ```
  **PRODUCT NAME**
  ``Retail:`` $X  |  ``Market:`` $Y  |  ``Multiple:`` Zx  |  🟢🟢 DBLGREEN
  One-line synthesis sentence.

  **———————————————————**

  **NEXT PRODUCT**
  ...

  ——————————————————

  Closing synthesis paragraph.
  ```
- Use `**bold**` for product headers
- Use `` ``Field:`` `` (double backtick) for inline labels
- Use `**———————————————————**` between products
- Use `——————————————————` (no bold) before closing paragraph
- Use ` ```code block``` ` for asides/callouts
- NO @here except last embed

### 4. Send
Write a one-off `.mjs` script, send, delete script. Rate limit: 1200ms between embeds.

```js
// Template
for (const embed of embeds) {
  const isLast = embed === embeds[embeds.length - 1];
  await send(isLast ? '@here' : '', embed);
  await new Promise(r => setTimeout(r, 1200));
}
```

### 5. Embed order
1. State of the Market (intro)
2. 🎴 Pokemon TCG
3. 🏴‍☠️ One Piece TCG
4. 🧙 Magic the Gathering
5. 🏰 Lorcana
6. ⚾ Sports Wax
7. 🎮 Collectibles & Toys
8. 🧱 LEGO + Forward Look (last embed → @here)

## Pricing sources (verified, no guessing)
- Pokemon singles/sealed: set-history.json + set-history-pokemon-jp.json
- Lorcana: set-history-lorcana.json + TCGCSV catId 71
- MTG: set-history-mtg.json
- One Piece: set-history-one-piece.json
- Sports: set-history-sports.json + sportscardspro.com (curl only)
- LEGO: set-history-lego.json + brickeconomy.com (curl only)
- Collectibles: eBay sold median from pipeline-results.json

## Voice rules
- Write in Jester's voice: direct, data-first, no hype, no filler phrases
- Forbidden: "Mark the calendar", "full stop", "full send", "everyone should", "correct answer"
- OK: terse analysis sentences, forward-looking calls, risk callouts
- UPCOMING products: always write as future ("drops July 21", "watch for coverage") — never as released
- One synthesis line per product MAX — numbers speak, don't explain them

## Common mistakes (avoid)
- Wrong SKU pricing (e.g. Lorcana single pack ≠ Trove): always verify productId against TCGCSV
- @here on every embed — ONLY last embed
- Cliché phrases in user's voice writeup
- Writing upcoming drops as already released
- Sending without DASHBOARD_MODE=1 dry-run first (for Fiddler pipeline) — for recap script, read output before running send
