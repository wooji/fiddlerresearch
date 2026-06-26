#!/usr/bin/env node
/**
 * monitor-final.mjs
 * Track both backfills, alert on completion/errors
 */

import { statSync, readFileSync } from 'fs';

const jobs = {
  players: { log: 'backfill-players-robust.log', pid: 1399, lastLines: 0 },
  products: { log: 'backfill-unified.log', pid: 1395, lastLines: 0 },
};

const log = msg => {
  console.log(msg);
  process.stdout.write(msg + '\n');
};

function getLineCount(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').length;
  } catch {
    return 0;
  }
}

function getLastLine(path) {
  try {
    const lines = readFileSync(path, 'utf8').split('\n').filter(l => l.trim());
    return lines[lines.length - 1] || '';
  } catch {
    return '';
  }
}

async function monitor() {
  log('[monitor] starting (60s intervals, both backfills)');

  while (true) {
    const now = new Date().toLocaleTimeString();
    log(`\n[${now}]`);

    for (const [name, job] of Object.entries(jobs)) {
      const lines = getLineCount(job.log);
      const last = getLastLine(job.log).slice(0, 80);
      const progress = lines === job.lastLines ? '(STALLED)' : '(↑)';

      log(`  ${name} | lines=${lines} ${progress} | ${last}`);

      // Check for completion
      if (last.includes('DONE') || last.includes('COMPLETE')) {
        log(`    ✓ ${name.toUpperCase()} COMPLETED`);
      }

      job.lastLines = lines;
    }

    // Wait 60s
    await new Promise(r => setTimeout(r, 60000));
  }
}

monitor().catch(e => {
  log(`[FATAL] ${e.message}`);
  process.exit(1);
});
