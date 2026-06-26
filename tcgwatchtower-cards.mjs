// Pull ALL card-level Pokemon data tcgwatchtower serves (every set in /sets.json)
// into pokemon-cards-tcgwatchtower.json. Card META via /api/cards?set=<setId>
// (works for every set). Complements the sealed-price enrichment in set-history.json.
// Site scope = Scarlet & Violet + Mega Evolution only (sitemap-confirmed).
// Usage: node tcgwatchtower-cards.mjs
import { writeFileSync, readFileSync, existsSync } from 'fs';

const OUT = './pokemon-cards-tcgwatchtower.json';
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { _meta: { source: 'tcgwatchtower.com /api/cards', updated: null }, sets: {} };

const sets = await (await fetch('https://tcgwatchtower.com/sets.json')).json();
const pk = sets.filter(s => !/one.?piece/i.test(s.series) && !/^(OP|EB)\d/i.test(s.short));
console.log(`[tcgwt-cards] ${pk.length} Pokemon sets\n`);

let totalCards = 0;
for (const s of pk) {
  try {
    const r = await fetch(`https://tcgwatchtower.com/api/cards?set=${encodeURIComponent(s.setId)}`);
    if (!r.ok) { console.error(`  · ${s.short} ${s.name} — api ${r.status}`); continue; }
    const j = await r.json();
    const cards = (j.cards ?? []).map(c => ({ localId: c.localId, name: c.name, rarity: c.rarity, image: c.image, source: c.source }));
    out.sets[s.setId] = { name: s.name, series: s.series, short: s.short, phase: s.phase, cardCount: cards.length, cards };
    totalCards += cards.length;
    console.log(`  ✓ ${s.short.padEnd(7)} ${s.name.slice(0, 32).padEnd(32)} ${cards.length} cards`);
    await new Promise(r => setTimeout(r, 400));
  } catch (e) { console.error(`  ! ${s.short} ${s.name}: ${e.message}`); }
}
out._meta.updated = '2026-06-20';
out._meta.totalCards = totalCards;
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`\n[tcgwt-cards] DONE — ${Object.keys(out.sets).length} sets, ${totalCards} cards → ${OUT}`);
