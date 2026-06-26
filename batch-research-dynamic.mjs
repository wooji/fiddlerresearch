#!/usr/bin/env node
/**
 * batch-research-dynamic.mjs
 * Run fiddler-research.mjs on all products in dynamic-products.json
 * Sequential (not concurrent) to avoid overwhelming APIs
 *
 * Usage: node batch-research-dynamic.mjs
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = '.';
const DYNAMIC_DB = join(ROOT, 'dynamic-products.json');
const LOG_FILE = join(ROOT, 'batch-research.log');

function log(msg) {
  console.log(msg);
  appendFileSync(LOG_FILE, msg + '\n');
}

async function main() {
  log(`[batch-research] starting ${new Date().toISOString()}`);

  let db;
  try {
    db = JSON.parse(readFileSync(DYNAMIC_DB, 'utf8'));
  } catch (e) {
    log(`[batch-research] ERROR: can't load ${DYNAMIC_DB} - ${e.message}`);
    process.exit(1);
  }

  const products = Object.keys(db);
  log(`[batch-research] ${products.length} products to research`);

  let completed = 0;
  let failed = 0;

  for (const key of products) {
    try {
      log(`  [${completed + 1}/${products.length}] ${key}...`);
      const cmd = `node fiddler-research.mjs "${key}"`;
      execSync(cmd, { stdio: 'pipe', env: { ...process.env, EVIDENCE_OK: '1' } });
      completed++;
      log(`    ✓ ${key}`);
    } catch (e) {
      failed++;
      log(`    ✗ ${key} - ${e.message.slice(0, 100)}`);
    }
  }

  log(`[batch-research] COMPLETE: ${completed}/${products.length} succeeded, ${failed} failed`);

  // Append all results to category DBs
  log(`[batch-research] appending to category databases...`);
  try {
    execSync('node append-research-to-db.mjs', { stdio: 'inherit' });
  } catch (e) {
    log(`[batch-research] append error (non-fatal): ${e.message}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  log(`[batch-research] FATAL: ${e.message}`);
  process.exit(1);
});
