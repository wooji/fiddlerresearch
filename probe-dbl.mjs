import { ebaySold } from './lib/deep-research.mjs';
const names={1:'Romance Dawn',2:'Paramount War',3:'Pillars of Strength',4:'Kingdoms of Intrigue',5:'Awakening of the New Era',6:'Wings of the Captain',7:'500 Years in the Future',8:'Two Legends',9:'Emperors in the New World',10:'Royal Blood',11:'A Fist of Divine Speed',12:'Legacy of the Master',13:'Carrying On His Will'};
for(const v of Object.keys(names)){
  const code='OP'+String(v).padStart(2,'0');
  const q=`One Piece ${code} Double Pack Set English sealed`;
  try{const r=await ebaySold(q,{retailFloor:30});console.log(`${code}|${r?.median?`$${r.median}|${r.count} sold|$${r.low}-$${r.high}`:'NO DATA'}`);}catch(e){console.log(code+'|ERR');}
}
