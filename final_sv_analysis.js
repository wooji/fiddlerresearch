const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./set-history.json', 'utf8'));

const setMetadata = {
  'scarlet-&-violet': { name: 'Scarlet & Violet (SV1)', flagship: 'Koraidon/Miraidon', printRun: 'High volume' },
  'temporal-forces': { name: 'Temporal Forces (SV4.5)', flagship: 'Paradox Pokemon', printRun: 'Moderate' },
  'paldea-evolved': { name: 'Paldea Evolved (SV3.5)', flagship: 'Terastallized', printRun: 'Moderate' },
  'obsidian-flames': { name: 'Obsidian Flames (SV3)', flagship: 'Armarouge/Ceruledge', printRun: 'Moderate' },
  'paradox-rift': { name: 'Paradox Rift (SV4)', flagship: 'Paradox Pokemon', printRun: 'Moderate' },
  'paldean-fates': { name: 'Paldean Fates (SV3.5alt)', flagship: 'Pokemon ex', printRun: 'Limited' },
  'stellar-crown': { name: 'Stellar Crown (SV5)', flagship: 'Stellar Tera', printRun: 'Moderate' },
  'shrouded-fable': { name: 'Shrouded Fable (SV4.5alt)', flagship: 'Iron Leaves/Walking Wake', printRun: 'Moderate' },
  'silver-tempest': { name: 'Silver Tempest (SV2.5)', flagship: 'Lugia', printRun: 'Moderate' },
  'crown-zenith': { name: 'Crown Zenith (Holiday 2023)', flagship: 'Pikachu/Mewtwo', printRun: 'Limited' },
  'scarlet-&-violet-151': { name: 'Scarlet & Violet 151 (SV2alt)', flagship: 'Mew/Kanto', printRun: 'Limited' },
  'journey-together': { name: 'Journey Together (SV6)', flagship: 'Pikachu/Charizard', printRun: 'Moderate' },
  'destined-rivals': { name: 'Destined Rivals (SV6.5)', flagship: 'Starter Pokemon', printRun: 'High' },
  'phantasmal-flames': { name: 'Phantasmal Flames (SV8)', flagship: 'Pecharunt', printRun: 'Limited' },
  'mega-evolution': { name: 'Mega Evolution (SV7)', flagship: 'Mega Pokemon', printRun: 'Moderate' },
  'black-bolt': { name: 'Black Bolt (SV7.5)', flagship: 'Raichu/Electric', printRun: 'Moderate' },
  'perfect-order': { name: 'Perfect Order (SV9)', flagship: 'Iono', printRun: 'High' },
  'ascended-heroes': { name: 'Ascended Heroes (SV8.5)', flagship: 'Starter Pokemon', printRun: 'Moderate' },
  'chaos-rising': { name: 'Chaos Rising (SV10)', flagship: 'Legendary Pokemon', printRun: 'High' },
  'prismatic-evolutions': { name: 'Prismatic Evolutions (SV6alt)', flagship: 'Starter Evolutions', printRun: 'High' }
};

const svSets = Object.keys(setMetadata);
const results = [];

for (const setKey of svSets) {
  const fullKey = 'pokemon-' + setKey;
  const set = data.sets[fullKey];
  
  if (set && set.products) {
    const bb = set.products['booster-box'];
    
    if (bb) {
      // Calculate floor
      let floor = 999999;
      let floorMonth = 'N/A';
      if (bb.series && bb.series.length > 0) {
        for (const s of bb.series) {
          if (s.price < floor) {
            floor = s.price;
            floorMonth = s.m;
          }
        }
      }
      if (floor === 999999) floor = 'N/A';
      
      const current = bb.current || 'N/A';
      const ath = bb.ath || 'N/A';
      const athMonth = bb.athMonth || 'N/A';
      
      // Calculate multipliers
      let currentMult = 'N/A';
      let athMult = 'N/A';
      let floorMult = 'N/A';
      
      if (typeof current === 'number') {
        currentMult = (current / 149.99).toFixed(2) + 'x';
      }
      if (typeof ath === 'number') {
        athMult = (ath / 149.99).toFixed(2) + 'x';
      }
      if (typeof floor === 'number') {
        floorMult = (floor / 149.99).toFixed(2) + 'x';
      }
      
      results.push({
        name: setMetadata[setKey].name,
        release: set.firstMonth || 'Unknown',
        bbCurrent: typeof current === 'number' ? `$${current.toFixed(2)}` : current,
        currentMult: currentMult,
        bbATH: typeof ath === 'number' ? `$${ath.toFixed(2)}` : ath,
        athMonth: athMonth,
        athMult: athMult,
        bbFloor: typeof floor === 'number' ? `$${floor.toFixed(2)}` : floor,
        floorMonth: floorMonth,
        floorMult: floorMult,
        flagship: setMetadata[setKey].flagship,
        printRun: setMetadata[setKey].printRun
      });
    }
  }
}

// Sort by release date
results.sort((a, b) => new Date(a.release + '-01') - new Date(b.release + '-01'));

console.log('POKEMON SCARLET & VIOLET ERA SEALED INVESTMENT ANALYSIS\n');
console.log('Booster Box (Hobbies) Performance — June 2026 Snapshot\n');
console.log('| Set | Release | Current $ | Current × | ATH | ATH Month | ATH × | Floor | Floor Month | Flagship IP | Notes |');
console.log('|:---|:---|---:|:---:|---:|:---|:---:|---:|:---|:---|:---|');

for (const r of results) {
  console.log(`| ${r.name} | ${r.release} | ${r.bbCurrent} | ${r.currentMult} | ${r.bbATH} | ${r.athMonth} | ${r.athMult} | ${r.bbFloor} | ${r.floorMonth} | ${r.flagship} | ${r.printRun} |`);
}
