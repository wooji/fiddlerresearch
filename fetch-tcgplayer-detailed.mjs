import playwright from 'playwright';

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.createContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to page...');
    const response = await page.goto('https://www.tcgplayer.com/product/644298/pokemon-me01-mega-evolution-mega-evolution-booster-box', {
      waitUntil: 'load'
    });
    
    console.log('Response status:', response?.status());
    
    // Wait longer and check for specific elements
    await page.waitForTimeout(4000);
    
    // Check if error message is present
    const errorMsg = await page.evaluate(() => {
      const text = document.body.innerText;
      if (text.includes("that's not right")) {
        return 'ERROR: Product page error detected';
      }
      return 'No error detected';
    });
    
    console.log('Status:', errorMsg);
    
    // Try to get data from any visible elements
    const allText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== FULL PAGE TEXT ===');
    console.log(allText);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await context.close();
    await browser.close();
  }
})();
