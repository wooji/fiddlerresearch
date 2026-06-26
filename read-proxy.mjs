import { Level } from 'level';

const db = new Level('C:/Users/Christopher/AppData/Roaming/order-tracker/Local Storage/leveldb', { valueEncoding: 'utf8' });

// Collect all entries first, then close
const entries = [];
try {
  for await (const [key, val] of db.iterator()) {
    entries.push({ key: String(key).slice(0, 80), val: String(val).slice(0, 120) });
    if (entries.length >= 30) break;
  }
} catch(e) {
  console.log('iter err:', e.message);
}
await db.close();

entries.forEach(e => console.log('KEY:', e.key, '\nVAL:', e.val, '\n'));
