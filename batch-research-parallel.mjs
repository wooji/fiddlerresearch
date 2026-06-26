#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = '.';
const DYNAMIC_DB = join(ROOT, 'dynamic-products.json');
const LOG_FILE = 'batch-research-parallel.log';

function log(msg) {
  console.log(msg);
  appendFileSync(LOG_FILE, msg + '\n');
}

async function main() {
  log(`[batch-research-parallel] starting ${new Date().toISOString()}`);

  const db = JSON.parse(readFileSync(DYNAMIC_DB, 'utf8'));
  const products = Object.keys(db);

  log(`[batch-research-parallel] ${products.length} products, 5 concurrent`);

  let completed = 0, failed = 0;
  const CONCURRENCY = 5;
  const batches = [];

  for (let i = 0; i < products.length; i += CONCURRENCY) {
    batches.push(products.slice(i, i + CONCURRENCY));
  }

  for (const batch of batches) {
    log(`[batch] ${batch.length} products (${completed}/${products.length})`);

    const promises = batch.map(key => 
      (async () => {
        try {
          execSync(`node fiddler-research.mjs "${key}"`, {
            stdio: 'pipe',
            env: { ...process.env, EVIDENCE_OK: '1', DASHBOARD_MODE: '1' },
            timeout: 120000
          });
          completed++;
          log(`  ✓ ${key}`);
        } catch (e) {
          failed++;
          log(`  ✗ ${key} - ${e.message.slice(0, 50)}`);
        }
      })()
    );

    await Promise.all(promises);
  }

  log(`[batch-research-parallel] COMPLETE: ${completed}/${products.length}, ${failed} failed`);

  log(`[batch-research-parallel] appending to category databases...`);
  try {
    execSync('node append-research-to-db.mjs', { stdio: 'inherit' });
  } catch (e) {
    log(`[append] error (non-fatal): ${e.message}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  log(`[FATAL] ${e.message}`);
  process.exit(1);
});
