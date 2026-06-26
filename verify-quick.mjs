// Quick probe: test key matching + first ~3000 chars of SSE for blister pack
import { chromium } from 'playwright';

// 1. Test key matching logic inline
const TYPE_WORDS = ['blister','boosterbox','booster','hobby','jumbo','etb','tin','bundle','starter','display','mega','hanger','collector'];
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const getTypeWord = s => TYPE_WORDS.find(t => s.includes(t));
const inputs = [
  'Disney Lorcana Wilds Unknown Blister Pack',
  'Disney Lorcana Wilds Unknown Booster Box',
  'Lorcana wilds unknown',
];
const keys = ['disney-lorcana-wilds-unknown-booster-box-24-packs'];

for (const input of inputs) {
  const needle = norm(input);
  const needleType = getTypeWord(needle);
  for (const k of keys) {
    const kn = norm(k);
    const keyType = getTypeWord(kn);
    let blocked = false;
    if (needleType && keyType && needleType !== keyType) blocked = true;
    console.log(`"${input}" vs "${k}": needleType=${needleType} keyType=${keyType} → ${blocked ? 'BLOCKED (type mismatch)' : 'ALLOWED'}`);
  }
}

// 2. Test SSE for blister pack — should create new product, not match booster box
console.log('\n--- SSE probe for blister pack ---');
const resp = await fetch('http://localhost:3434/api/research', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: null, label: 'Disney Lorcana Wilds Unknown Blister Pack', category: 'other_tcg', DASHBOARD_MODE: '1' }),
});
console.log('Status:', resp.status);
const { Readable } = await import('stream');
const stream = Readable.fromWeb(resp.body);
stream.setEncoding('utf8');
let buf = '';
await new Promise(resolve => {
  stream.on('data', c => { buf += c; if (buf.length > 2000) { stream.destroy(); resolve(); } });
  stream.on('end', resolve); stream.on('error', resolve);
  setTimeout(resolve, 10000);
});
console.log('SSE start:\n' + buf.slice(0, 2000));
