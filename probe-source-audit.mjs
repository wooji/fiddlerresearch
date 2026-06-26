import { deepResearch, computeRisk, computeRating } from './lib/deep-research.mjs';

const query = '2026 Topps Disney Chrome Entertainment Hobby';
const retail = 429.99;
const market = 600;
const ebayFee = 0.13;
const salesTax = 0.08;

const signals = await deepResearch(query, 1561);

const costBasis = retail * (1 + salesTax);
const netProfit = market * (1 - ebayFee) - costBasis;
const roi = Math.round((netProfit / costBasis) * 100);
const marketMultiple = +(market / retail).toFixed(2);

const riskResult = computeRisk({ profitabilityRoi: roi, supplyScore: 20, signals });

// T+30 momentum
const sentimentSum =
  (signals.reddit?.sentiment    ?? 0) * 1.5 +
  (signals.x?.sentiment         ?? 0) +
  (signals.discord?.sentiment   ?? 0) * 1.5 +
  (signals.instagram?.sentiment ?? 0) +
  (signals.facebook?.sentiment  ?? 0) +
  (signals.google?.sentiment    ?? 0);
const ebayTrend  = signals.ebay?.median ? (signals.ebay.median - market) / market : 0;
const hwTrades   = signals.historicalWholesale?.flatMap(p => p.market?.trades ?? []) ?? [];
const hwAvg      = hwTrades.length ? hwTrades.reduce((s,t)=>s+t.price,0)/hwTrades.length : null;
const hwTrend    = hwAvg ? Math.max(-0.05, Math.min(0.05, (hwAvg - market) / market * 0.5)) : 0;
const supplyDrag = (signals.amazon?.inStock || signals.walmart?.inStock) ? -0.03 : 0;
const momentum30 = Math.max(-0.15, Math.min(0.25, (sentimentSum * 0.012) + ebayTrend * 1.5 + hwTrend + supplyDrag));
const t30Market  = Math.round(market * (1 + momentum30) * 100) / 100;
const t30Net     = t30Market * (1 - ebayFee) - costBasis;
const t30Roi     = Math.round((t30Net / costBasis) * 100);

const ratingResult = computeRating({ roi: t30Roi > roi ? t30Roi : roi, marketMultiple, riskResult, signals });

console.log('\n============================================================');
console.log('FIDDLER VARIABLE BREAKDOWN — 2026 Topps Disney Chrome');
console.log('============================================================\n');

console.log('── PRICING ──────────────────────────────────────────────');
console.log(`  retail:        $${retail}`);
console.log(`  costBasis:     $${costBasis.toFixed(2)} (retail × 1.08 tax)`);
console.log(`  market:        $${market} (manual estimate)`);
console.log(`  netProfit:     $${netProfit.toFixed(2)}/unit`);
console.log(`  roi:           ${roi}%`);
console.log(`  marketMultiple:${marketMultiple}x`);

console.log('\n── EBAY (live) ──────────────────────────────────────────');
console.log(`  count:   ${signals.ebay?.count ?? '❌ null'}`);
console.log(`  median:  $${signals.ebay?.median ?? '❌ null'}`);
console.log(`  low:     $${signals.ebay?.low ?? '❌ null'}`);
console.log(`  high:    $${signals.ebay?.high ?? '❌ null'}`);
console.log(`  → feeds: ebayTrend=${ebayTrend.toFixed(4)}, volumePts`);

console.log('\n── DEALERNETX HISTORICAL (2025 comp) ───────────────────');
if (!signals.historicalWholesale?.length) {
  console.log('  ❌ EMPTY');
} else {
  signals.historicalWholesale.forEach(p => {
    const m = p.market;
    console.log(`  ${p.name.trim()}`);
    console.log(`    ask:$${m?.lowestAsk} bid:$${m?.highestBid} last:$${m?.lastTrade} trades:${m?.tradeCount} avg:$${m?.avgTrade}`);
  });
  console.log(`  hwAvg: $${hwAvg?.toFixed(2)} → hwTrend: ${hwTrend.toFixed(4)}`);
}

console.log('\n── REDDIT ───────────────────────────────────────────────');
console.log(`  mentions:  ${signals.reddit?.mentions ?? '❌ null'}`);
console.log(`  sentiment: ${signals.reddit?.sentiment ?? '❌ null'}`);
console.log(`  → sentimentSum contribution: ${((signals.reddit?.sentiment ?? 0) * 1.5).toFixed(1)}`);

console.log('\n── X/TWITTER ────────────────────────────────────────────');
console.log(`  count:     ${signals.x?.count ?? '❌ null'}`);
console.log(`  sentiment: ${signals.x?.sentiment ?? '❌ null'}`);
signals.x?.tweets?.forEach(t => console.log(`  tweet: "${t.slice(0,80)}"`));

console.log('\n── INSTAGRAM ────────────────────────────────────────────');
console.log(`  count:     ${signals.instagram?.count ?? '❌ null'}`);
console.log(`  sentiment: ${signals.instagram?.sentiment ?? '❌ null'}`);

console.log('\n── FACEBOOK ─────────────────────────────────────────────');
console.log(`  count:     ${signals.facebook?.count ?? '❌ null'}`);
console.log(`  sentiment: ${signals.facebook?.sentiment ?? '❌ null'}`);

console.log('\n── GOOGLE ───────────────────────────────────────────────');
console.log(`  count:     ${signals.google?.count ?? '❌ null'}`);
console.log(`  sentiment: ${signals.google?.sentiment ?? '❌ null'}`);

console.log('\n── DISCORD ──────────────────────────────────────────────');
console.log(`  mentions:  ${signals.discord?.mentions ?? '❌ null'}`);
console.log(`  sentiment: ${signals.discord?.sentiment ?? '❌ null'}`);

console.log('\n── WALMART ──────────────────────────────────────────────');
console.log(`  inStock: ${signals.walmart?.inStock ?? '❌ null'}`);
console.log(`  → supplyDrag: ${supplyDrag}`);

console.log('\n── AMAZON ───────────────────────────────────────────────');
console.log(`  inStock: ${signals.amazon?.inStock ?? '❌ null'}`);
console.log(`  price:   $${signals.amazon?.price ?? '❌ null'}`);
console.log(`  → supplyDrag already counted: ${supplyDrag}`);

console.log('\n── COMPUTED MOMENTUM ────────────────────────────────────');
console.log(`  sentimentSum:  ${sentimentSum.toFixed(2)}`);
console.log(`  ebayTrend:     ${ebayTrend.toFixed(4)}`);
console.log(`  hwTrend:       ${hwTrend.toFixed(4)}`);
console.log(`  supplyDrag:    ${supplyDrag}`);
console.log(`  momentum30:    ${momentum30.toFixed(4)} → T+30 market: $${t30Market}`);
console.log(`  t30Net:        $${t30Net.toFixed(2)} | t30Roi: ${t30Roi}%`);

console.log('\n── RISK SCORE ───────────────────────────────────────────');
console.log(`  score: ${riskResult.score}/100 → ${riskResult.label}`);
console.log(`  profitPts: ${riskResult.breakdown.profitPts}/30`);
console.log(`  supplyPts: ${riskResult.breakdown.supplyPts}/25`);
console.log(`  demandPts: ${riskResult.breakdown.demandPts}/25`);
console.log(`  futurePts: ${riskResult.breakdown.futurePts}/20`);

console.log('\n── RATING ───────────────────────────────────────────────');
console.log(`  rating: ${ratingResult.rating} (score ${ratingResult.score})`);
console.log(`  reasons: ${ratingResult.reasons.join(', ') || 'none'}`);
console.log('============================================================\n');
