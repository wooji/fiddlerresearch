// Self-healing supervisor for the TCG backfills.
// Runs each DB sequentially; watches the child's progress; on ANY fault
// (process exit, stall = no new progress line for STALL_MS, or crash) it
// auto-restarts that DB (resume-safe). Every event is written to
// backfill-status.json + supervisor.log — never silent.
// Run detached:  nohup node backfill-supervisor.mjs > supervisor.log 2>&1 &
import { spawn, spawnSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';

// Kill ANY stray backfill-tcg children before spawning — guarantees exactly one
// scraper at a time even if a prior restart raced (no concurrency => no 429).
function killStrayChildren() {
  try {
    spawnSync('powershell', ['-c', `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*backfill-tcg*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { timeout: 15000 });
  } catch {}
}

const DBS = ['mtg', 'lorcana', 'other-tcg', 'sports'];
const STALL_MS = 120000;          // no progress line in 2 min => stall => restart
const MAX_RESTARTS = 8;           // per DB, then mark failed + move on
const STATUS = 'backfill-status.json';

// PUSH alert to Discord — fires the moment a DB finishes/fails or all complete,
// so completion never depends on anyone polling. Webhook from root .env.
const WEBHOOK = (() => { try { return Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })).EXTERNAL_WEBHOOK_URL; } catch { return null; } })();
async function notify(msg) {
  if (!WEBHOOK) return;
  try { await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: `🛠️ **Backfill** — ${msg}` }) }); } catch {}
}

const log = m => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); try { appendFileSync('supervisor.log', line + '\n'); } catch {} };
const scanned = db => { try { return Object.keys(JSON.parse(readFileSync(`set-history-${db}.json`, 'utf8')).sets).length; } catch { return 0; } };

const state = {};
DBS.forEach(d => state[d] = { state: 'pending', scanned: scanned(d), restarts: 0, lastProgress: null, note: '' });
const writeStatus = () => { try { writeFileSync(STATUS, JSON.stringify({ updated: new Date().toISOString(), dbs: state }, null, 1)); } catch {} };
writeStatus();

// Run one DB to completion, restarting on fault. Resolves when DONE or failed-out.
function runDB(db) {
  return new Promise(resolve => {
    let starting = false, done = false;
    const start = () => {
      if (starting || done) return;           // re-entrancy guard against double-spawn
      starting = true;
      killStrayChildren();                     // singleton: no orphaned scraper survives
      state[db].state = 'running';
      state[db].lastProgress = Date.now();
      writeStatus();
      log(`${db}: start (attempt ${state[db].restarts + 1}, ${scanned(db)} already scanned)`);

      const child = spawn('node', ['backfill-tcg.mjs', db], { stdio: ['ignore', 'pipe', 'pipe'] });
      starting = false;
      const finish = (ok, note) => {
        if (done) return; done = true;
        clearInterval(watch);
        try { child.kill('SIGKILL'); } catch {}
        if (ok) { state[db].state = 'done'; state[db].note = note; log(`${db}: DONE — ${note}`); writeStatus(); notify(`✅ ${db} DONE — ${scanned(db)} scanned`); return resolve(); }
        // fault path: restart or give up
        state[db].restarts++;
        if (state[db].restarts >= MAX_RESTARTS) { state[db].state = 'failed'; state[db].note = note; log(`${db}: FAILED after ${MAX_RESTARTS} restarts — ${note}`); writeStatus(); notify(`❌ ${db} FAILED after ${MAX_RESTARTS} restarts — ${note}`); return resolve(); }
        state[db].state = 'restarting'; state[db].note = note; log(`${db}: FAULT (${note}) — restarting`); writeStatus();
        setTimeout(start, 5000);
      };

      const onLine = buf => {
        const t = buf.toString();
        if (/^\[\d+\/\d+\]/m.test(t)) { state[db].lastProgress = Date.now(); state[db].scanned = scanned(db); writeStatus(); }
        if (/\[backfill\] DONE/.test(t)) finish(true, t.match(/DONE — .*/)?.[0] ?? 'done');
      };
      child.stdout.on('data', onLine);
      child.stderr.on('data', onLine);
      child.on('exit', (code) => { if (!done) finish(false, `process exited code ${code} (silent death)`); });
      child.on('error', (e) => { if (!done) finish(false, `spawn error ${e.message}`); });

      // Stall watchdog
      const watch = setInterval(() => {
        if (done) return;
        const idle = Date.now() - state[db].lastProgress;
        if (idle > STALL_MS) finish(false, `stalled ${Math.round(idle / 1000)}s (no progress line)`);
      }, 15000);
    };
    start();
  });
}

log('supervisor: started');
await notify(`▶️ started — ${DBS.join(', ')}`);
for (const db of DBS) { if (state[db].state !== 'done') await runDB(db); }
log('supervisor: ALL COMPLETE');
state._allDone = true; writeStatus();
const summary = DBS.map(d => `${d} ${state[d].state} (${scanned(d)})`).join(' · ');
await notify(`🏁 ALL COMPLETE — ${summary}`);
