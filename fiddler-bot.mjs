/**
 * Fiddler Bot — Discord command listener
 * Polls the Fiddler research channel for !research commands
 * Usage: node fiddler-bot.mjs
 *
 * Commands (post in channel 1516298588261585097):
 *   !research <tcgplayer-url>       — look up by TCGPlayer product URL
 *   !research <product-key>         — run existing product key directly
 *   !research <free text name>      — fuzzy match / auto-resolve via TCGPlayer search
 *   !keys                           — list all known product keys
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { spawn } from 'child_process';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)));
const envRaw  = readFileSync(join(ROOT, '.env'), 'utf8');
const env     = Object.fromEntries(
  envRaw.split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const TOKEN      = env.DISCORD_USER_TOKEN;
const CHANNEL_ID = '1516298588261585097';
const POLL_MS    = 5000;
const STATE_FILE = join(ROOT, '.bot-state.json');

if (!TOKEN) { console.error('DISCORD_USER_TOKEN missing'); process.exit(1); }

// ── State (last seen message ID) ───────────────────────────────────────────────
let lastId = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, 'utf8')).lastId ?? null
  : null;

function saveState() {
  writeFileSync(STATE_FILE, JSON.stringify({ lastId }));
}

// ── Discord helpers ────────────────────────────────────────────────────────────
async function discordGet(path) {
  const r = await fetch(`https://discord.com/api/v9${path}`, {
    headers: { Authorization: TOKEN },
  });
  if (!r.ok) throw new Error(`Discord ${r.status} ${path}`);
  return r.json();
}

async function react(messageId, emoji) {
  await fetch(
    `https://discord.com/api/v9/channels/${CHANNEL_ID}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    { method: 'PUT', headers: { Authorization: TOKEN } }
  );
}

async function sendMessage(content) {
  await fetch(`https://discord.com/api/v9/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

// ── Product key resolution ─────────────────────────────────────────────────────
function loadProducts() {
  const dynPath = join(ROOT, 'dynamic-products.json');
  const dynamic = existsSync(dynPath) ? JSON.parse(readFileSync(dynPath, 'utf8')) : {};
  // Extract keys from static map by parsing the file (regex scan for quoted keys)
  const src = readFileSync(join(ROOT, 'fiddler-research.mjs'), 'utf8');
  const staticKeys = [...src.matchAll(/^\s+'([a-z0-9-]+)':\s*\{/gm)].map(m => m[1]);
  const staticTcgIds = {};
  for (const m of src.matchAll(/'([a-z0-9-]+)':\s*\{[^}]*?tcgId:\s*(\d+)/gs)) {
    staticTcgIds[m[1]] = parseInt(m[2]);
  }
  return { staticKeys, dynamicKeys: Object.keys(dynamic), dynamic, staticTcgIds };
}

function extractTcgId(input) {
  const m = input.match(/tcgplayer\.com\/product\/(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

async function resolveProductKey(input) {
  const { staticKeys, dynamicKeys, dynamic, staticTcgIds } = loadProducts();
  const allKeys = [...staticKeys, ...dynamicKeys];

  // 1. Direct key match
  if (allKeys.includes(input.trim())) return { key: input.trim(), isNew: false };

  // 2. TCGPlayer URL → extract product ID
  const tcgId = extractTcgId(input);
  if (tcgId) {
    // Check existing products for matching tcgId
    const existingStatic = Object.entries(staticTcgIds).find(([, id]) => id === tcgId);
    if (existingStatic) return { key: existingStatic[0], isNew: false };
    const existingDynamic = Object.entries(dynamic).find(([, p]) => p.tcgId === tcgId);
    if (existingDynamic) return { key: existingDynamic[0], isNew: false };

    // New product — scrape TCGPlayer for metadata
    return await createDynamicProduct(tcgId, null);
  }

  // 3. Free text — search TCGPlayer
  return await createDynamicProduct(null, input.trim());
}

async function createDynamicProduct(tcgId, name) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  let productId = tcgId;
  let productName = name;
  let setName = '';
  let marketPrice = null;
  let imageUrl = null;

  try {
    if (tcgId) {
      await page.goto(`https://www.tcgplayer.com/product/${tcgId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else {
      const q = encodeURIComponent(name);
      await page.goto(`https://www.tcgplayer.com/search/pokemon/sealed-products?q=${q}&view=grid`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const link = await page.$('a[href*="/product/"]');
      if (!link) { await browser.close(); return null; }
      const href = await link.getAttribute('href');
      const m = href.match(/\/product\/(\d+)\//);
      if (!m) { await browser.close(); return null; }
      productId = parseInt(m[1]);
      await page.goto(`https://www.tcgplayer.com/product/${productId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    }

    productName = await page.title().then(t => t.replace(' | TCGplayer', '').trim()).catch(() => productName ?? `Product ${productId}`);
    const breadcrumbs = await page.$$eval('nav[aria-label="breadcrumb"] a, .breadcrumb a', els => els.map(e => e.textContent.trim())).catch(() => []);
    setName = breadcrumbs.find(b => b.includes('ME') || b.includes('SV') || b.includes('Mega') || b.includes('Scarlet') || b.includes('Pokemon')) ?? breadcrumbs[breadcrumbs.length - 2] ?? '';
    const priceEl = await page.$('.spotlight__price, [data-testid="price-guide-market"]');
    if (priceEl) marketPrice = parseFloat((await priceEl.textContent()).replace(/[^0-9.]/g, '')) || null;
    imageUrl = await page.$eval('img.product-gallery__image, img[alt*="product"]', el => el.src).catch(() => null);
  } catch (e) {
    console.error('[bot] TCGPlayer scrape error:', e.message);
  } finally {
    await browser.close();
  }

  if (!productId) return null;

  // Generate a key from product name
  const key = (productName ?? `product-${productId}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

  const entry = {
    label:       productName ?? `Product ${productId}`,
    set:         setName || 'Pokemon TCG',
    retail:      marketPrice ? Math.round(marketPrice * 0.5 * 100) / 100 : 0,
    retailNote:  'Distributor / Secondary — verify cost basis',
    releaseUrl:  `https://www.tcgplayer.com/product/${productId}`,
    rating:      'GREEN',
    tcgId:       productId,
    ebayQuery:   productName ?? `Pokemon ${productId}`,
    images:      [productId],
    contents:    productName ?? '',
    sellThrough: {
      flip:    { range: 'TBD', units: '' },
      hold:    { range: 'TBD', units: '' },
      invest:  { range: 'TBD', units: '' },
    },
    bulkBuy:     '',
    risk:        '🟡 Medium — auto-resolved product, verify manually',
    ebayFee:     0.13,
    writeup:     { market: '', product: '', priceComp: '', supplyDemand: '', recs: '' },
  };

  // Save to dynamic-products.json
  const dynPath = join(ROOT, 'dynamic-products.json');
  const existing = existsSync(dynPath) ? JSON.parse(readFileSync(dynPath, 'utf8')) : {};
  existing[key] = entry;
  writeFileSync(dynPath, JSON.stringify(existing, null, 2));
  console.log(`[bot] Created dynamic product: ${key}`);

  return { key, isNew: true };
}

// ── Run pipeline ───────────────────────────────────────────────────────────────
function runPipeline(key, webhookOverride) {
  return new Promise((resolve, reject) => {
    const args = [join(ROOT, 'fiddler-research.mjs'), key];
    if (webhookOverride) args.push(`--webhook=${webhookOverride}`);
    const proc = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
    let out = '';
    proc.stdout.on('data', d => { out += d; process.stdout.write(d); });
    proc.stderr.on('data', d => process.stderr.write(d));
    proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(`exit ${code}`)));
  });
}

// ── Poll loop ──────────────────────────────────────────────────────────────────
async function poll() {
  try {
    const params = lastId ? `?after=${lastId}&limit=10` : `?limit=1`;
    const messages = await discordGet(`/channels/${CHANNEL_ID}/messages${params}`);
    if (!messages.length) return;

    // Process oldest first
    const sorted = [...messages].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
    lastId = sorted[sorted.length - 1].id;
    saveState();

    // Skip bootstrap message (first poll just sets the cursor)
    if (!existsSync(STATE_FILE + '.bootstrapped')) {
      writeFileSync(STATE_FILE + '.bootstrapped', '1');
      return;
    }

    for (const msg of sorted) {
      const text = msg.content?.trim() ?? '';

      if (text.startsWith('!keys')) {
        const { staticKeys, dynamicKeys } = loadProducts();
        const all = [...new Set([...staticKeys, ...dynamicKeys])].filter(k => !k.startsWith('_')).sort();
        await sendMessage(`**Fiddler product keys:**\n\`\`\`\n${all.join('\n')}\n\`\`\``);
        continue;
      }

      if (!text.startsWith('!research ')) continue;

      const input = text.slice('!research '.length).trim();
      if (!input) continue;

      console.log(`[bot] Received: !research ${input}`);
      await react(msg.id, '🔍');

      try {
        const resolved = await resolveProductKey(input);
        if (!resolved) {
          await react(msg.id, '❌');
          await sendMessage(`Could not resolve product: \`${input}\``);
          continue;
        }
        if (resolved.isNew) {
          await sendMessage(`Auto-resolved new product → key: \`${resolved.key}\` — running pipeline...`);
        }
        await runPipeline(resolved.key);
        await react(msg.id, '✅');
      } catch (err) {
        console.error('[bot] Pipeline error:', err.message);
        await react(msg.id, '❌');
        await sendMessage(`Pipeline failed for \`${input}\`: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('[bot] Poll error:', err.message);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────
console.log(`[Fiddler Bot] Listening on channel ${CHANNEL_ID} — poll every ${POLL_MS}ms`);
console.log(`[Fiddler Bot] Commands: !research <tcgplayer-url | key | name>  |  !keys`);

// Init cursor on first run
if (!lastId) {
  try {
    const msgs = await discordGet(`/channels/${CHANNEL_ID}/messages?limit=1`);
    if (msgs.length) { lastId = msgs[0].id; saveState(); }
    writeFileSync(STATE_FILE + '.bootstrapped', '1');
    console.log(`[Fiddler Bot] Cursor initialized to ${lastId} — ready`);
  } catch (e) {
    console.error('[bot] Init error:', e.message);
  }
}

setInterval(poll, POLL_MS);
