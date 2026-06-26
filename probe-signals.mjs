import { redditSignal, xSignal, discordSignal } from './lib/deep-research.mjs';

const query = '2025 Topps Inception Baseball Hobby Box';

console.log('=== REDDIT (Playwright) ===');
const r = await redditSignal(query);
console.log(`mentions=${r.mentions} sentiment=${r.sentiment}`);
r.posts?.slice(0, 5).forEach(p => console.log(` [${p.sub}] ${p.title?.slice(0, 80)}`));

console.log('\n=== X/TWITTER (Google fallback) ===');
const x = await xSignal(query);
console.log(x ? `count=${x.count} sentiment=${x.sentiment} source=${x.source}` : 'null');
x?.tweets?.slice(0, 5).forEach(t => console.log(` - ${t.slice(0, 100)}`));

console.log('\n=== DISCORD ===');
const d = await discordSignal('Topps Inception');
console.log(`mentions=${d?.mentions ?? 0}`);
