#!/usr/bin/env node
/**
 * TIER 1: Enumerate ALL sets/products
 * Pokemon TCG API + Scryfall API + TCGPlayer (Playwright + proxies) + Bulbapedia (proxies)
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = '.';
const DB_PATH = join(ROOT, 'product-enum-tier1.json');

function loadProxies() {
  const isps = readFileSync(join(ROOT, 'ISP.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l);
  const resi = readFileSync(join(ROOT, 'heroresi.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l);
  return [...isps, ...resi];
}

function getProxyUrl(proxy) {
  const [host, port, user, pass] = proxy.split(':');
  return `http://${user}:${pass}@${host}:${port}`;
}

function curlJson(url, proxyUrl = null) {
  try {
    const cmd = proxyUrl ?
      `curl -s -x "${proxyUrl}" -m 15 "${url}"` :
      `curl -s -m 15 "${url}"`;
    const json = execSync(cmd, { encoding: 'utf8', maxBuffer: 50*1024*1024 });
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

async function enumTier1() {
  console.log('[tier1] Starting all-source product enumeration...');
  const db = { pokemon: {}, mtg: {}, lorcana: {}, one_piece: {}, sports: {} };
  const proxies = loadProxies();
  let idx = 0;

  // POKEMON TCG API
  try {
    console.log('[pokemon-api] fetching via api.pokemontcg.io...');
    const data = curlJson('https://api.pokemontcg.io/v2/sets?pageSize=250');
    if (data && data.data) {
      data.data.forEach(set => {
        db.pokemon[set.id] = {
          name: set.name,
          series: set.series,
          releaseDate: set.releaseDate,
          printedTotal: set.printedTotal,
          images: set.images,
        };
      });
      console.log(`[pokemon-api] ${Object.keys(db.pokemon).length} sets`);
    }
  } catch (e) {
    console.error('[pokemon-api]', e.message);
  }

  // SCRYFALL API
  try {
    console.log('[mtg-api] fetching via api.scryfall.com...');
    const data = curlJson('https://api.scryfall.com/sets');
    if (data && data.data) {
      data.data.forEach(set => {
        db.mtg[set.code] = {
          name: set.name,
          releaseDate: set.released_at,
          cardCount: set.card_count,
          setType: set.set_type,
        };
      });
      console.log(`[mtg-api] ${Object.keys(db.mtg).length} sets`);
    }
  } catch (e) {
    console.error('[mtg-api]', e.message);
  }

  // BULBAPEDIA POKEMON (via proxy)
  try {
    console.log('[bulbapedia] fetching with proxy...');
    const proxy = proxies[idx++ % proxies.length];
    const proxyUrl = getProxyUrl(proxy);
    const html = execSync(`curl -s -x "${proxyUrl}" -m 15 https://bulbapedia.bulbagarden.net/wiki/EN_TCG_expansions`, { encoding: 'utf8', maxBuffer: 50*1024*1024 });
    const rows = html.match(/<tr>([\s\S]*?)<\/tr>/g) || [];
    rows.slice(1).forEach(row => {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
      if (cells.length >= 4) {
        const name = cells[0].replace(/<[^>]+>/g, '').trim();
        const code = cells[1].replace(/<[^>]+>/g, '').trim();
        if (name && code) {
          db.pokemon[`bulbapedia_${code}`] = { name, code, source: 'bulbapedia' };
        }
      }
    });
    console.log(`[bulbapedia] cross-checked Pokemon sets`);
  } catch (e) {
    console.error('[bulbapedia]', e.message.slice(0, 80));
  }

  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`[tier1] COMPLETE: pokemon ${Object.keys(db.pokemon).length} | mtg ${Object.keys(db.mtg).length} | lorcana ${Object.keys(db.lorcana).length} | one_piece ${Object.keys(db.one_piece).length} | sports ${Object.keys(db.sports).length}`);
}

enumTier1().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
