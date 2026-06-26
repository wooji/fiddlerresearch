import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  try {
    console.log('Navigating...');
    const response = await page.goto('https://www.tcgplayer.com/product/644298/pokemon-me01-mega-evolution-mega-evolution-booster-box', {
      waitUntil: 'load',
      timeout: 15000
    });
    
    console.log('Response status:', response?.status());
    await page.waitForTimeout(3000);
    
    const data = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        containsError: text.includes("that's not right"),
        textPreview: text.substring(0, 500),
        fullText: text
      };
    });
    
    if (data.containsError) {
      console.log('ERROR: TCGPlayer returned error page');
      console.log('This product ID may be invalid or page is unavailable');
    } else {
      console.log('Page loaded successfully');
    }
    
    console.log('\n=== TEXT PREVIEW ===');
    console.log(data.textPreview);
    console.log('\n=== LOOKING FOR DATA ===');
    
    // Search for key information in the text
    const lines = data.fullText.split('\n');
    const relevantLines = lines.filter(line => 
      line.includes('$') || 
      line.includes('price') || 
      line.includes('pack') ||
      line.includes('Market') ||
      line.includes('Lowest')
    ).slice(0, 20);
    
    console.log(relevantLines.join('\n'));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
