#!/usr/bin/env node
import { execSync } from 'child_process';
import { appendFileSync } from 'fs';

const LOG = 'fetch-all-cards-v2.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
}

async function runScript(name, file, timeout = 300) {
  log(`\n[START] ${name}`);
  const start = Date.now();

  try {
    execSync(`timeout ${timeout} node ${file}`, { stdio: 'inherit' });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`[✓] ${name} (${elapsed}s)`);
    return true;
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`[✗] ${name} (${elapsed}s)`);
    return false;
  }
}

async function main() {
  log(`[fetch-all-cards-v2] START`);

  // Primary: tcgcsv CSV (all TCGs, free CSV download, daily 20:00 UTC)
  const primary = await runScript('TCGCSV Individual Cards (CSV)', 'tcgcsv-csv-fetcher.mjs', 300);

  // Secondary: Sealed pricing (PriceCharting + StockX)
  const sealed = await runScript('Sealed Pricing (PriceCharting + StockX)', 'tcg-refresh-sealed.mjs', 180);

  log(`\n[SUMMARY]`);
  log(`  Individual cards (tcgcsv): ${primary ? '✓' : '✗'}`);
  log(`  Sealed products: ${sealed ? '✓' : '✗'}`);
  log(`\n[COMPLETE] ${new Date().toISOString()}`);

  process.exit(primary && sealed ? 0 : 1);
}

main();
