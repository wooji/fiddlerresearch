#!/usr/bin/env node
/**
 * monitor-backfill.mjs
 * Auto-monitoring loop: detect stalls, diagnose, fix, restart
 */

import { execSync, spawn } from 'child_process';
import { statSync, readFileSync } from 'fs';
import { join } from 'path';

const LOG_FILE = 'backfill-hist.log';
const MAX_STALL_TIME = 30000; // 30s no progress = stall
const CHECK_INTERVAL = 15000; // Check every 15s
let lastLineCount = 0;
let lastCheckTime = Date.now();
let stallCount = 0;
let restartCount = 0;
const MAX_RESTARTS = 5;

function getLogProgress() {
  try {
    const stat = statSync(LOG_FILE);
    const content = readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    return { lines: lines.length, mtime: stat.mtimeMs, content };
  } catch {
    return { lines: 0, mtime: 0, content: '' };
  }
}

function isProcessRunning(pid) {
  try {
    execSync(`ps -p ${pid} > /dev/null 2>&1`);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid) {
  try {
    execSync(`kill -9 ${pid}`);
    console.log(`[monitor] killed PID ${pid}`);
    return true;
  } catch (e) {
    console.log(`[monitor] failed to kill ${pid}: ${e.message}`);
    return false;
  }
}

function diagnoseError(content) {
  if (content.includes('error on')) return 'search_error';
  if (content.includes('rate limit') || content.includes('429')) return 'rate_limit';
  if (content.includes('timeout') || content.includes('ECONNREFUSED')) return 'timeout';
  if (content.includes('auth') || content.includes('login')) return 'auth_error';
  return 'unknown_stall';
}

function fixAndRestart(issue) {
  stallCount++;
  restartCount++;

  if (restartCount > MAX_RESTARTS) {
    console.log(`[monitor] FATAL: ${MAX_RESTARTS} restarts exhausted, giving up`);
    process.exit(1);
  }

  console.log(`[monitor] detected stall (${issue}) — restart #${restartCount}`);

  // Kill any existing process
  try {
    execSync('pkill -f backfill-dealernetx-historical');
  } catch {}

  // Brief pause
  execSync('sleep 3');

  // Restart with adjusted settings
  const cmd = `nohup node backfill-dealernetx-historical.mjs >> ${LOG_FILE} 2>&1 &`;
  console.log(`[monitor] restarting: ${cmd}`);
  execSync(cmd);

  // Reset counters
  lastLineCount = 0;
  lastCheckTime = Date.now();
}

async function monitorLoop() {
  console.log('[monitor] starting backfill monitor (120s stall threshold)...');

  while (restartCount < MAX_RESTARTS) {
    const { lines, mtime, content } = getLogProgress();
    const now = Date.now();
    const timeSinceLastUpdate = now - mtime;

    console.log(`[monitor] log: ${lines} lines, last update: ${Math.round(timeSinceLastUpdate / 1000)}s ago`);

    // Check if stalled
    if (lines === lastLineCount && timeSinceLastUpdate > MAX_STALL_TIME) {
      const issue = diagnoseError(content);
      console.log(`[monitor] STALL DETECTED (${issue}): no progress for ${Math.round(timeSinceLastUpdate / 1000)}s`);
      fixAndRestart(issue);
    } else {
      lastLineCount = lines;
      stallCount = 0;
    }

    // Check for completion
    if (content.includes('[backfill-hist] complete:')) {
      console.log('[monitor] backfill complete!');
      console.log(content.split('\n').filter(l => l.includes('complete')).join('\n'));
      process.exit(0);
    }

    // Wait 15s before next check
    await new Promise(r => setTimeout(r, CHECK_INTERVAL));
  }

  console.log(`[monitor] max restarts reached, exiting`);
  process.exit(1);
}

monitorLoop().catch(e => {
  console.error('[monitor] fatal:', e);
  process.exit(1);
});
