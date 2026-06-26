import { wholesaleSearch } from './lib/prices.mjs';

console.log('[test] calling wholesaleSearch("Topps baseball")...');
try {
  const result = await wholesaleSearch('Topps baseball');
  console.log('[test] result:', result?.length, 'products');
  if (result?.length > 0) {
    console.log('[test] first result:', result[0]);
  }
} catch (e) {
  console.error('[test] error:', e.message);
  console.error('[test] stack:', e.stack);
}
process.exit(0);
