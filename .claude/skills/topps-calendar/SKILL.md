# topps-calendar

Look up a Topps product on the release calendar to get the verified drop timestamp, title, and retail price.

## When to use
- ANY Topps product research — before adding a product to fiddler-research.mjs
- Whenever you need a release date/timestamp for a Topps product
- NEVER calculate or guess Topps timestamps — always use this skill

## How to use

### CLI (one-off lookup)
```
node topps-calendar.mjs <slug-fragment> [productPageUrl]
```
Examples:
```
node topps-calendar.mjs chrome-marvel
node topps-calendar.mjs basketball "https://www.topps.com/pages/topps-chrome-updates-basketball"
node topps-calendar.mjs topps-chrome-updates-basketball
```

### Import in pipeline scripts
```js
import { lookupToppsProduct } from './topps-calendar.mjs';

const info = await lookupToppsProduct('chrome-marvel', 'https://www.topps.com/products/...');
// info = { slug, title, dropDate, unixTs, discordTs, retail, retailNote, isFuture }

// Use in product entry:
releaseDate: info.discordTs,   // e.g. "<t:1782925200:F> (<t:1782925200:R>)"
retail:      info.retail,      // null → 'TBA' if isFuture
```

## Workflow (what the module does internally)
1. **Ensure CDP**: checks `http://127.0.0.1:9222/json/version` — if dead, auto-launches `chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\Temp\chrome-debug`
2. **Connect**: `chromium.connectOverCDP('http://127.0.0.1:9222')` via Playwright
3. **Navigate**: `page.goto('https://www.topps.com/release-calendar', {waitUntil:'domcontentloaded'})` + `waitForTimeout(9000)` — JS must hydrate `dropDate` into HTML before reading
4. **Extract**: regex `/"url":"([^"]+)","dropDate":"([^"]+)"/g` on `page.content()` → ISO string
5. **Convert**: `new Date(iso).getTime() / 1000` → Unix; wrap as `<t:UNIX:F>` for Discord
6. **Retail**: if `productUrl` provided, fetches page and extracts price from JSON-LD or visible `$XXX` amounts; if `isFuture && !retail` → `retail = null, retailNote = 'TBA'`

## Rules (hard)
- NEVER skip this for Topps release dates — never calculate offsets, never guess timestamps
- If slug not found in calendar → product not listed yet → set `discordTs: 'TBA'`, `retail: null`
- dropDate ISO field in calendar is authoritative — product page dates are secondary only
- If retail not on Topps page → check DA Card World, GameStop, Beckett via WebFetch before marking TBA

## Return shape
```js
{
  slug:       '/pages/topps-chrome-marvel',   // matched calendar URL
  title:      '2026 Topps Chrome Marvel...',  // from product page h1
  dropDate:   '2026-07-01T17:00:00.000Z',     // ISO from calendar JS
  unixTs:     1782925200,                     // seconds
  discordTs:  '<t:1782925200:F> (<t:1782925200:R>)',
  retail:     299.99,                         // null if TBA
  retailNote: 'MSRP $299.99 verified Topps.com',
  isFuture:   false,
}
```
