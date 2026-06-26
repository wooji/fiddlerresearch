const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./set-history.json', 'utf8'));

// Map set codes to their official names and flagship Pokemon
const setMetadata = {
  'scarlet-&-violet': { name: 'Scarlet & Violet', flagship: 'Koraidon/Miraidon' },
  'temporal-forces': { name: 'Temporal Forces', flagship: 'Paradox Pokemon' },
  'paldea-evolved': { name: 'Paldea Evolved', flagship: 'Terastallized Pokemon' },
  'obsidian-flames': { name: 'Obsidian Flames', flagship: 'Armarouge/Ceruledge' },
  'paradox-rift': { name: 'Paradox Rift', flagship: 'Paradox Pokemon' },
  'paldean-fates': { name: 'Paldean Fates', flagship: 'Pokemon ex' },
  'stellar-crown': { name: 'Stellar Crown', flagship: 'Stellar Tera Pokemon' },
  'shrouded-fable': { name: 'Shrouded Fable', flagship: 'Iron Leaves/Walking Wake' },
  'silver-tempest': { name: 'Silver Tempest', flagship: 'Lugia' },
  'crown-zenith': { name: 'Crown Zenith', flagship: 'Pikachu/Mewtwo' },
  'scarlet-&-violet-151': { name: 'Scarlet & Violet 151', flagship: 'Mew/Kanto Pokemon' },
  'journey-together': { name: 'Journey Together', flagship: 'Pikachu/Charizard' },
  'destined-rivals': { name: 'Destined Rivals', flagship: 'Sprigatito/Fuecoco/Quaxly' },
  'phantasmal-flames': { name: 'Phantasmal Flames', flagship: 'Pecharunt' },
  'mega-evolution': { name: 'Mega Evolution', flagship: 'Mega Pokemon' },
  'black-bolt': { name: 'Black Bolt', flagship: 'Raichu/Electric' },
  'perfect-order': { name: 'Perfect Order', flagship: 'Iono' },
  'ascended-heroes': { name: 'Ascended Heroes', flagship: 'Starter Pokemon' },
  'chaos-rising': { name: 'Chaos Rising', flagship: 'Legendary Pokemon' },
  'prismatic-evolutions': { name: 'Prismatic Evolutions', flagship: 'Starter Evolutions' }
};

const svSets = Object.keys(setMetadata);
const results = [];

for (const setKey of svSets) {
  const fullKey = 'pokemon-' + setKey;
  const set = data.sets[fullKey];
  
  if (set && set.products) {
    const bb = set.products['booster-box'];
    const etb = set.products['elite-trainer-box'];
    
    // Get floor (lowest price after release)
    let floor = 'N/A';
    let floorMonth = 'N/A';
    if (bb && bb.series && bb.series.length > 0) {
      let min = Math.min(...bb.series.map(s => s.price));
      floor = min;
      for (const s of bb.series) {
        if (s.price === min) {
          floorMonth = s.m;
          break;
        }
      }
    }
    
    results.push({
      name: setMetadata[setKey].name,
      release: set.firstMonth || 'Unknown',
      releaseDate: new Date(set.firstMonth + '-01'),
      bbMSRP: '149.99',
      bbCurrent: bb ? bb.current : 'N/A',
      bbATH: bb ? bb.ath : 'N/A',
      bbATHMonth: bb ? bb.athMonth : 'N/A',
      bbFloor: floor,
      bbFloorMonth: floorMonth,
      etbMSRP: '49.99',
      etbCurrent: etb ? etb.current : 'N/A',
      etbATH: etb ? etb.ath : 'N/A',
      etbATHMonth: etb ? etb.athMonth : 'N/A',
      flagship: setMetadata[setKey].flagship
    });
  }
}

// Sort by release date
results.sort((a, b) => a.releaseDate - b.releaseDate);

console.log('| Set | Release | MSRP (BB) | Current (BB) | ATH (BB) | ATH Month | Floor (BB) | Floor Month | MSRP (ETB) | Current (ETB) | ATH (ETB) | Flagship |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');

for (const r of results) {
  console.log(`| ${r.name} | ${r.release} | $${r.bbMSRP} | $${r.bbCurrent} | $${r.bbATH} | ${r.bbATHMonth} | $${r.bbFloor} | ${r.bbFloorMonth} | $${r.etbMSRP} | $${r.etbCurrent} | $${r.etbATH} | ${r.flagship} |`);
}
