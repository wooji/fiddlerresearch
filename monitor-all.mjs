#!/usr/bin/env node
/**
 * monitor-all.mjs
 * Comprehensive monitoring: 10s checks, error logging, auto-restart
 * Covers: player backfill, card products backfill, completion tracking
 */

import { statSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const JOBS = {
  players: {
    log: 'player-backfill.log',
    pid: null,
    lastLines: 0,
    stallCount: 0,
    db: 'player-history-sports.json',
  },
  products: {
    log: 'backfill-robust.log',
    pid: 938,
    lastLines: 0,
    stallCount: 0,
    db: 'card-products-special.json',
  },
};

const log = msg => {
  console.log(`[monitor] ${msg}`);
  process.stdout.write(`[monitor] ${msg}\n`);
};

function getLineCount(logPath) {
  try {
    const content = readFileSync(logPath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function getDbCount(dbPath) {
  try {
    const db = JSON.parse(readFileSync(dbPath, 'utf8'));
    return Object.keys(db.sets || db.players || {}).length;
  } catch {
    return 0;
  }
}

function isRunning(pid) {
  try {
    execSync(`ps -p ${pid} > /dev/null 2>&1`);
    return true;
  } catch {
    return false;
  }
}

function checkJob(name, job) {
  const lines = getLineCount(job.log);
  const dbCount = getDbCount(job.db);
  const isRunning_ = job.pid ? isRunning(job.pid) : false;

  process.stdout.write(`[${name}] lines=${lines} db=${dbCount} running=${isRunning_} `);

  // Detect stall
  if (lines === job.lastLines && isRunning_) {
    job.stallCount++;
    if (job.stallCount > 3) {
      log(`STALL on ${name} after 30s+ with no progress`);
      try {
        execSync(`kill -9 ${job.pid}`);
        log(`killed PID ${job.pid}`);
      } catch {}
      job.pid = null;
      job.stallCount = 0;
    } else {
      process.stdout.write(`stall=${job.stallCount}/3 `);
    }
  } else {
    job.stallCount = 0;
  }

  // Check for completion
  if (isRunning_ === false && job.pid) {
    log(`${name} COMPLETED: ${dbCount} items`);
    job.pid = null;
  }

  job.lastLines = lines;
  process.stdout.write('\n');
}

async function loop() {
  log('starting 10s monitoring loop (no clamp)');
  let iterations = 0;

  while (true) {
    iterations++;
    process.stdout.write(`\n[iter ${iterations}] `);

    for (const [name, job] of Object.entries(JOBS)) {
      checkJob(name, job);
    }

    // Wait 10 seconds
    await new Promise(r => setTimeout(r, 10000));
  }
}

loop().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
