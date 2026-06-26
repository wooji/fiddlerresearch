#!/usr/bin/env node
// Query the LEGO investment DB. Usage:
//   node report-lego.mjs                      -> summary by class + top holds
//   node report-lego.mjs <setNum>             -> one set's full characterization
//   node report-lego.mjs accumulate           -> active sets to buy pre-EOL
//   node report-lego.mjs flip                  -> retired sets with flip premium
//   node report-lego.mjs retiring              -> active-retiring, by retire window
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const DB = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'set-history-lego.json'), 'utf8'));
const sets = Object.values(DB.sets);
const fmt = v => `${(v.setNum+'').padEnd(6)} ${(v.name||'').replace(/^LEGO /,'').slice(0,30).padEnd(30)} $${(v.retail??'?')}→$${v.valueNew??'?'} ${v.char?.premium??'?'}x ${v.cagr??'?'}%CAGR ${v.status.padEnd(15)} ${(v.retiredOn||v.projRetire||'').slice(0,18)}`;
const arg = process.argv[2];

if (arg && /^\d+$/.test(arg)) {
  const v = DB.sets[arg]; if (!v) { console.log('not found'); process.exit(1); }
  console.log(JSON.stringify(v, null, 2));
} else if (arg === 'accumulate') {
  console.log('ACCUMULATE pre-EOL (active, buy at/below retail, hold past retirement):');
  sets.filter(v => (v.char?.invClass||'').startsWith('ACCUMULATE')).sort((a,b)=>(b.cagr||0)-(a.cagr||0)).forEach(v=>console.log(' '+fmt(v)));
} else if (arg === 'flip') {
  console.log('FLIP-viable (retired, sealed clears retail w/ margin):');
  sets.filter(v => /flip-viable/.test(v.char.shortTerm)).sort((a,b)=>(b.char.premium||0)-(a.char.premium||0)).slice(0,40).forEach(v=>console.log(' '+fmt(v)));
} else if (arg === 'retiring') {
  console.log('ACTIVE-RETIRING (window closing — accumulate before EOL):');
  sets.filter(v => v.status==='active-retiring').sort((a,b)=>(b.cagr||0)-(a.cagr||0)).slice(0,40).forEach(v=>console.log(' '+fmt(v)));
} else {
  const cls = {}; for (const v of sets) { const c = (v.char?.invClass||'').split(' ')[0]; cls[c]=(cls[c]||0)+1; }
  console.log(`LEGO DB — ${sets.length} sets | classes:`, cls);
  console.log('\nTOP LONG-TERM (retired, A-tier CAGR):');
  sets.filter(v=>v.status==='retired'&&v.char?.longTier==='A').sort((a,b)=>(b.cagr||0)-(a.cagr||0)).slice(0,15).forEach(v=>console.log(' '+fmt(v)));
  console.log('\nTOP ACCUMULATE (active, strong forecast):');
  sets.filter(v=>(v.char?.invClass||'').startsWith('ACCUMULATE')).sort((a,b)=>(b.cagr||0)-(a.cagr||0)).slice(0,15).forEach(v=>console.log(' '+fmt(v)));
}
