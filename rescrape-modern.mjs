// Force re-scrape modern sets (early backfill runs saved partial products).
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { chromium } from 'playwright';
import { pcAllSealed } from './lib/pricecharting.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'set-history.json');
const hist = JSON.parse(readFileSync(OUT, 'utf8'));

// slugs of modern sets to force-refresh
const SLUGS = [
  'pokemon-destined-rivals','pokemon-chaos-rising','pokemon-ascended-heroes','pokemon-perfect-order',
  'pokemon-phantasmal-flames','pokemon-mega-evolution','pokemon-pitch-black','pokemon-scarlet-&-violet-151',
  'pokemon-prismatic-evolutions','pokemon-crown-zenith','pokemon-surging-sparks','pokemon-paldean-fates',
  'pokemon-obsidian-flames','pokemon-paradox-rift','pokemon-temporal-forces','pokemon-twilight-masquerade',
  'pokemon-stellar-crown','pokemon-shrouded-fable','pokemon-evolving-skies','pokemon-paldea-evolved',
  'pokemon-journey-together','pokemon-brilliant-stars','pokemon-astral-radiance','pokemon-lost-origin',
  'pokemon-silver-tempest','pokemon-vivid-voltage','pokemon-battle-styles','pokemon-fusion-strike','pokemon-chilling-reign',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const slug of SLUGS) {
  if (!hist.sets[slug]) { console.log(`· ${slug} not in DB, skip`); continue; }
  let all = [];
  let b = null;
  try { b = await chromium.launch({ headless: true }); all = await pcAllSealed(slug, b); }
  catch (e) { console.log(`! ${slug}: ${e.message}`); }
  finally { if (b) await b.close().catch(()=>{}); }
  if (all.length) {
    const products = {};
    for (const r of all) products[r.type] = { current:r.current,currentMonth:r.currentMonth,ath:r.ath,athMonth:r.athMonth,first:r.first,firstMonth:r.firstMonth,months:r.points,url:r.url,series:r.series };
    const deepest = all.reduce((a,r)=>r.points>a.points?r:a,all[0]);
    hist.sets[slug] = { name: hist.sets[slug].name, firstMonth: deepest.firstMonth, products };
    writeFileSync(OUT, JSON.stringify(hist, null, 1));
    console.log(`✓ ${slug.padEnd(34)} ${Object.keys(products).join(',')}`);
  } else console.log(`· ${slug} no data`);
  await sleep(300);
}
console.log('done');
