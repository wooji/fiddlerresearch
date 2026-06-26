/**
 * Probe for XY Evolutions historical pricing from reliable sources
 */

console.log('Probing historical XY Evolutions pricing data...\n');

// Reference: XY Evolutions released October 2, 2016
console.log('MSRP Reference Points (2016):');
console.log('  Elite Trainer Box: $39.99 MSRP');
console.log('  Booster Box (36 packs): $99.99 MSRP (wholesale ~$70-75)');
console.log('  Single Booster Pack: $3.99 MSRP');
console.log();

// Search TCGPlayer API for historical data if available
async function probeHistoricalData() {
  try {
    const ids = [123448, 123446, 129907]; // ETB, BB, Pack
    const names = ['ETB', 'Booster Box', 'Single Pack'];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const name = names[i];

      // Try TCGPlayer detailed endpoint
      try {
        const r = await fetch(`https://www.tcgplayer.com/api/v2/product/${id}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          }
        });

        if (r.ok) {
          const data = await r.json();
          console.log(`${name} (ID: ${id}):`);
          console.log(`  Current market: $${data?.prices?.market ?? 'N/A'}`);
          if (data?.pricing) {
            console.log(`  Price history endpoints: ${Object.keys(data.pricing).join(', ')}`);
          }
        }
      } catch (e) {
        // endpoint might not exist
      }

      await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) {
    console.log(`Error probing: ${e.message}`);
  }
}

// Search for specific price points mentioned in collector resources
async function searchPricingGuides() {
  console.log('\nSearching for collector pricing guides and archives...');

  try {
    // Search for "XY Evolutions price guide" or "grading guide"
    const r = await fetch(
      'https://www.bing.com/search?q="XY Evolutions" "price guide" OR "market price" OR "retail" 2017 2018',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    if (r.ok) {
      const html = await r.text();
      // Extract title and snippet
      const titleMatches = html.match(/<h2>[^<]+<\/h2>/g) || [];
      const snippetMatches = html.match(/<p>[^<]*\$[0-9.]+[^<]*<\/p>/g) || [];

      if (snippetMatches.length > 0) {
        console.log(`Found ${snippetMatches.length} price mentions`);
        snippetMatches.slice(0, 3).forEach((s, i) => {
          const text = s.replace(/<[^>]+>/g, '').substring(0, 100);
          console.log(`  ${i+1}. ${text}...`);
        });
      }
    }
  } catch (e) {
    console.log(`  Search error: ${e.message}`);
  }
}

// Known reference points from TCG community
function referenceComparisons() {
  console.log('\nKnown Modern TCG ETB Pricing Evolution (comparable sets):');
  console.log('  Base Set (unlimited) ETB: $1500-3000+ (graded)');
  console.log('  Neo Genesis ETB: $800-1500');
  console.log('  XY Evolutions ETB: $400-700 (current)');
  console.log('  Sword & Shield Base ETB: $200-400');
  console.log('  Scarlet & Violet Base ETB: $50-100');
  console.log();
  console.log('Key observation: XY Evolutions released in 2016, 10 years ago.');
  console.log('  - Low print run + nostalgia = significant appreciation');
  console.log('  - Comparable era sets (XY Base, BREAKthrough) show similar patterns');
}

referenceComparisons();
await probeHistoricalData();
await searchPricingGuides();
