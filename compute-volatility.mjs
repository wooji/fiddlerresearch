#!/usr/bin/env node
// Compute volatility and trend metrics from historical price series
// Run: node compute-volatility.mjs [output-file]

import { readFileSync, writeFileSync } from 'fs';

function computeMetrics(series) {
  if (!series || series.length < 2) return null;

  const prices = series.map(s => s.price);
  const mean = prices.reduce((a, b) => a + b) / prices.length;
  const variance = prices.reduce((a, p) => a + Math.pow(p - mean, 2)) / prices.length;
  const stdDev = Math.sqrt(variance);
  const volatility = mean > 0 ? stdDev / mean : 0;

  // Trend: compute slope of series
  const xs = prices.map((_, i) => i);
  const ys = prices;
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b);
  const sumY = ys.reduce((a, b) => a + b);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  let trend = 'stable';
  if (slope > 0.5) trend = 'uptrend';
  else if (slope < -0.5) trend = 'downtrend';

  return { volatility: Math.round(volatility * 10000) / 10000, trend, slope: Math.round(slope * 100) / 100 };
}

function process() {
  const dbFile = 'set-history.json';
  const db = JSON.parse(readFileSync(dbFile, 'utf-8'));

  console.log('📊 Computing volatility metrics...\n');

  let added = 0;
  for (const setKey of Object.keys(db.sets)) {
    const setRec = db.sets[setKey];
    if (!setRec.products) continue;

    for (const prodType of Object.keys(setRec.products)) {
      const prod = setRec.products[prodType];
      if (!prod.series || prod.volatility) continue; // Skip if no series or already computed

      const metrics = computeMetrics(prod.series);
      if (metrics) {
        prod.volatility = metrics.volatility;
        prod.trend = metrics.trend;
        added++;
      }
    }
  }

  db._meta.updated = new Date().toISOString().split('T')[0];
  writeFileSync(dbFile, JSON.stringify(db, null, 1));

  console.log(`✓ Added volatility to ${added} products`);
  console.log('  Saved to set-history.json');
}

process().catch(e => { console.error('Error:', e); process.exit(1); });
