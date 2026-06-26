#!/usr/bin/env node
import { execSync } from 'child_process';
import { appendFileSync } from 'fs';

const LOG = 'fetch-all-cards.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
}

async function runScript(name, file, timeout = 600) {
  log(`\n[START] ${name} (timeout ${timeout}s)`);
  const start = Date.now();

  try {
    execSync(`timeout ${timeout} node ${file}`, { stdio: 'inherit' });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`[✓] ${name} complete (${elapsed}s)`);
    return true;
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`[✗] ${name} failed/timeout (${elapsed}s) — ${e.message.split('\n')[0]}`);
    return false;
  }
}

async function main() {
  log(`[fetch-all-cards] ${new Date().toISOString()} START`);

  // Sequential execution (eBay/T&T have rate limits)
  const mtg = await runScript('Scryfall MTG Cards', 'scryfall-fetch-cards-v2.mjs', 600);
  const ebay = await runScript('eBay Individual Cards', 'ebay-fetch-cards.mjs', 1200);
  const tnt = await runScript('Troll & Toad Cards', 'tnt-fetch-cards.mjs', 1200);

  log(`\n[SUMMARY]`);
  log(`  Scryfall MTG: ${mtg ? '✓' : '✗'}`);
  log(`  eBay Cards: ${ebay ? '✓' : '✗'}`);
  log(`  Troll & Toad: ${tnt ? '✓' : '✗'}`);
  log(`\n[COMPLETE] ${new Date().toISOString()}`);

  process.exit(mtg && ebay && tnt ? 0 : 1);
}

main();
