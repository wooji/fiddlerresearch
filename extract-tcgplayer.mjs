import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  try {
    await page.goto('https://www.tcgplayer.com/product/644298/pokemon-me01-mega-evolution-mega-evolution-booster-box', {
      waitUntil: 'load',
      timeout: 15000
    });
    
    await page.waitForTimeout(2000);
    
    const data = await page.evaluate(() => {
      const text = document.body.innerText;
      
      const result = {};
      
      // Extract product name - usually in the breadcrumb/main heading area
      const lines = text.split('\n');
      const megaEvoIdx = lines.findIndex(l => l.includes('ME01') && l.includes('Mega Evolution'));
      if (megaEvoIdx !== -1) {
        result.productName = lines[megaEvoIdx].trim();
      }
      
      // Extract set name
      const setMatch = text.match(/ME01:\s*Mega Evolution/);
      if (setMatch) {
        result.setName = 'ME01: Mega Evolution';
      }
      
      // Extract lowest listing price
      const lowestMatch = text.match(/As low as \$?([\d.]+)/);
      if (lowestMatch) {
        result.lowestListingPrice = `$${lowestMatch[1]}`;
      }
      
      // Extract market price (look for "Market Price" followed by dollar)
      const marketMatch = text.match(/Market Price\s+\$?([\d.]+)/);
      if (marketMatch) {
        result.marketPrice = `$${marketMatch[1]}`;
      }
      
      // Extract number of packs from description
      const packsMatch = text.match(/Each box contains (\d+) booster packs/);
      if (packsMatch) {
        result.packs = parseInt(packsMatch[1]);
      }
      
      return result;
    });
    
    console.log('=== RAW DATA EXTRACTION ===');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
