const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./set-history.json', 'utf8'));

const svSets = [
  'scarlet-&-violet',
  'temporal-forces',
  'paldea-evolved',
  'obsidian-flames',
  'paradox-rift',
  'paldean-fates',
  'stellar-crown',
  'shrouded-fable',
  'silver-tempest',
  'crown-zenith',
  'scarlet-&-violet-151',
  'journey-together',
  'destined-rivals',
  'phantasmal-flames',
  'mega-evolution',
  'black-bolt',
  'perfect-order',
  'ascended-heroes',
  'chaos-rising',
  'prismatic-evolutions'
];

const setInfo = [];

for (const setKey of svSets) {
  const fullKey = 'pokemon-' + setKey;
  const set = data.sets[fullKey];
  
  if (set) {
    const boosterBox = set.products['booster-box'];
    const etb = set.products['elite-trainer-box'];
    
    const output = {
      code: setKey,
      name: set.name || setKey,
      release: set.firstMonth || 'N/A',
      boosterBoxCurrent: boosterBox ? boosterBox.current : 'N/A',
      boosterBoxATH: boosterBox ? boosterBox.ath : 'N/A',
      boosterBoxATHMonth: boosterBox ? boosterBox.athMonth : 'N/A',
      boosterBoxFirst: boosterBox ? boosterBox.first : 'N/A',
      etbCurrent: etb ? etb.current : 'N/A',
      etbATH: etb ? etb.ath : 'N/A',
      etbATHMonth: etb ? etb.athMonth : 'N/A',
      etbFirst: etb ? etb.first : 'N/A'
    };
    setInfo.push(output);
  }
}

console.log('Set,Release,BB_MSRP,BB_Current,BB_ATH,BB_ATH_Month,ETB_MSRP,ETB_Current,ETB_ATH,ETB_ATH_Month');
setInfo.forEach(s => {
  console.log(`${s.name},${s.release},149.99/${s.boosterBoxFirst},${s.boosterBoxCurrent},${s.boosterBoxATH},${s.boosterBoxATHMonth},49.99/${s.etbFirst},${s.etbCurrent},${s.etbATH},${s.etbATHMonth}`);
});
