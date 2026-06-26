#!/bin/bash
echo "🚀 All-Categories Parallel Backfill"

# Pokemon already running, start others
timeout 900 node backfill-pokemon-comprehensive.mjs "C:\Users\Christopher\Desktop\ISP.txt" "" 0 > /tmp/pokemon.log 2>&1 &
echo "Pokemon (305): $!"

# MTG stub — use generic category backfill
timeout 900 node -e "
import { readFileSync, writeFileSync } from 'fs';
import { pcConsoleListBy, SEALED_TYPES_BY } from './lib/pricecharting.mjs';
import { chromium } from 'playwright';

const PROXIES = readFileSync('C:\Users\Christopher\Desktop\ISP.txt', 'utf-8').split('\n').filter(l=>l).map(l=>{const[ip,port,u,p]=l.split(':'); return {server:\`http://\${ip}:\${port}\`,username:u,password:p};});
let idx=0;
const nextProxy=()=>PROXIES[idx++%PROXIES.length];

async function run() {
  const db = {_meta:{source:'pc',updated:new Date().toISOString().split('T')[0]},sets:{}};
  try {
    const sets = await pcConsoleListBy('magic-cards', /^magic-/, s=>s.replace(/^magic-/,''));
    console.log('MTG: '+sets.length+' sets');
    for (const {slug,name} of sets.slice(0,30)) {
      if(!db.sets[slug]) db.sets[slug]={name,products:{}};
      for(const t of SEALED_TYPES_BY.mtg.slice(0,3)) {
        const p=nextProxy();const b=await chromium.launch({headless:true,proxy:p});
        try{const {pcSealed}=await import('./lib/pricecharting.mjs');const r=await pcSealed(slug,t,b);
          if(r) {db.sets[slug].products[t]=r; console.log('✓ '+slug+'/'+t);}
        }finally{await b.close();}
        await new Promise(r=>setTimeout(r,400));
      }
    }
  } catch(e) {console.error('MTG err:',e.message);}
  writeFileSync('set-history-mtg.json',JSON.stringify(db,null,1));
  console.log('MTG done');
}
run();
" > /tmp/mtg.log 2>&1 &
echo "MTG: $!"

wait
echo "✓ All backfills complete"
