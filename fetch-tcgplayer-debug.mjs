import playwright from 'playwright';

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to page...');
    await page.goto('https://www.tcgplayer.com/product/644298/pokemon-me01-mega-evolution-mega-evolution-booster-box', {
      waitUntil: 'networkidle'
    });
    
    console.log('Waiting for content...');
    await page.waitForTimeout(3000);
    
    // Dump page text
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('=== PAGE TEXT (first 3000 chars) ===');
    console.log(pageText.substring(0, 3000));
    console.log('\n=== PAGE TEXT (chars 3000-6000) ===');
    console.log(pageText.substring(3000, 6000));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
