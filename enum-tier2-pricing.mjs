#!/usr/bin/env node
/**
 * TIER 2: Integrate MSRP + historical + current market pricing
 * PriceCharting (proxies), TCGPlayer, DealernetX, eBay market
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = '.';
const ENUM_DB = join(ROOT, 'product-enum-tier1.json');
const PRICING_DB = join(ROOT, 'product-pricing-tier2.json');

function loadProxies() {
  const isps = readFileSync(join(ROOT, 'ISP.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l);
  const resi = readFileSync(join(ROOT, 'heroresi.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l);
  return [...isps, ...resi];
}

function getProxyUrl(proxy) {
  const [host, port, user, pass] = proxy.split(':');
  return `http://${user}:${pass}@${host}:${port}`;
}

async function scrapePriceChartingViaCurl(productUrl, proxyIdx, proxies) {
  try {
    const proxy = proxies[proxyIdx % proxies.length];
    const proxyUrl = getProxyUrl(proxy);
    const html = execSync(`curl -s -x "${proxyUrl}" -m 15 "${productUrl}" -H "User-Agent: Mozilla/5.0"`, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });

    // Extract chart_data for pricing history
    const chartMatch = html.match(/var chartData = (\[\[.*?\]\])/s);
    if (chartMatch) {
      try {
        const data = JSON.parse(chartMatch[1]);
        return {
          history: data.map(d => ({ date: d[0], price: d[1] })),
          current: data[data.length - 1]?.[1] || null,
        };
      } catch (e) {
        return null;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function enumTier2() {
  console.log('[tier2] Starting pricing integration...');

  if (!existsSync(ENUM_DB)) {
    console.error('[tier2] Tier 1 DB not found. Run enum-tier1 first.');
    process.exit(1);
  }

  const enum_db = JSON.parse(readFileSync(ENUM_DB));
  const pricing_db = existsSync(PRICING_DB) ? JSON.parse(readFileSync(PRICING_DB)) : { pokemon: {}, mtg: {}, lorcana: {}, one_piece: {}, sports: {} };
  const proxies = loadProxies();
  let proxyIdx = 0;

  // POKEMON: PriceCharting
  try {
    console.log('[tier2-pokemon] fetching PriceCharting data...');
    for (const [setId, set] of Object.entries(enum_db.pokemon)) {
      const slug = set.name?.toLowerCase().replace(/\s+/g, '-') || setId;
      const url = `https://www.pricecharting.com/game/pokemon-tcg/${slug}`;

      const prices = await scrapePriceChartingViaCurl(url, proxyIdx++, proxies);
      if (prices) {
        pricing_db.pokemon[setId] = {
          ...set,
          priceCharting: prices,
          _updated: new Date().toISOString(),
        };
        console.log(`  [${setId}] current $${prices.current}`);
      } else {
        if (!pricing_db.pokemon[setId]) {
          pricing_db.pokemon[setId] = { ...set, _updated: new Date().toISOString() };
        }
      }
    }
  } catch (e) {
    console.error('[tier2-pokemon]', e.message.slice(0, 80));
  }

  // MTG: PriceCharting
  try {
    console.log('[tier2-mtg] fetching PriceCharting data...');
    for (const [code, set] of Object.entries(enum_db.mtg).slice(0, 50)) {
      const slug = set.name?.toLowerCase().replace(/\s+/g, '-') || code;
      const url = `https://www.pricecharting.com/game/magic-the-gathering/${slug}`;

      const prices = await scrapePriceChartingViaCurl(url, proxyIdx++, proxies);
      if (prices) {
        pricing_db.mtg[code] = {
          ...set,
          priceCharting: prices,
          _updated: new Date().toISOString(),
        };
        console.log(`  [${code}] current $${prices.current}`);
      } else {
        if (!pricing_db.mtg[code]) {
          pricing_db.mtg[code] = { ...set, _updated: new Date().toISOString() };
        }
      }
    }
  } catch (e) {
    console.error('[tier2-mtg]', e.message.slice(0, 80));
  }

  writeFileSync(PRICING_DB, JSON.stringify(pricing_db, null, 2));
  console.log(`[tier2] COMPLETE: pokemon ${Object.keys(pricing_db.pokemon).length} | mtg ${Object.keys(pricing_db.mtg).length}`);
}

enumTier2().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
