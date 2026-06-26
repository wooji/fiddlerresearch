#!/usr/bin/env node
// Overlay brickfanatics EXACT retirement dates onto set-history-lego.json.
// Run AFTER backfill-lego.mjs completes (avoids JSON write race).
// Adds `retireExact` + bumps active sets to 'active-retiring'. Re-characterizes EOL proximity.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(fileURLToPath(import.meta.url));
const DB   = JSON.parse(readFileSync(join(ROOT, 'set-history-lego.json'), 'utf8'));
const CAL  = JSON.parse(readFileSync(join(ROOT, 'lego-retirement-calendar.json'), 'utf8'));

let merged = 0, added = 0;
for (const [num, date] of Object.entries(CAL.sets)) {
  let s = DB.sets[num];
  if (!s) { s = DB.sets[num] = { setNum: num, name: null, char: {} }; added++; }
  s.retireExact = date;                       // brickfanatics authoritative date
  s.retireSource = 'brickfanatics';
  if (s.status !== 'retired' && new Date(date) > new Date('2026-06-22')) s.status = 'active-retiring';
  merged++;
}
DB._meta.retirementCalendar = CAL._meta.source;
DB._meta.updated = '2026-06-22';
writeFileSync(join(ROOT, 'set-history-lego.json'), JSON.stringify(DB, null, 2) + '\n');
console.log(`merged ${merged} exact retirement dates (${added} new stub sets) into set-history-lego.json`);
