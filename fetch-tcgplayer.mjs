import playwright from 'playwright';

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://www.tcgplayer.com/product/644298/pokemon-me01-mega-evolution-mega-evolution-booster-box', {
      waitUntil: 'networkidle'
    });
    
    // Wait for content
    await page.waitForTimeout(2000);
    
    // Extract all data
    const data = await page.evaluate(() => {
      const result = {};
      
      // Product name (h1 or product title)
      const h1 = document.querySelector('h1');
      result.productName = h1 ? h1.textContent.trim() : null;
      
      // Look for all text with prices
      const allText = document.body.innerText;
      
      // Market price - look for pattern "Market Price: $XX.XX"
      const marketMatch = allText.match(/Market Price[:\s]+\$?([\d.]+)/i);
      result.marketPrice = marketMatch ? `$${marketMatch[1]}` : null;
      
      // Lowest listing - look for pattern "Lowest Listing: $XX.XX"
      const lowestMatch = allText.match(/Lowest Listing[:\s]+\$?([\d.]+)/i);
      result.lowestListing = lowestMatch ? `$${lowestMatch[1]}` : null;
      
      // Set name from breadcrumb or text
      const breadcrumb = document.querySelector('[data-testid="breadcrumbs"]');
      if (breadcrumb) {
        const links = breadcrumb.querySelectorAll('a');
        if (links.length > 0) {
          result.setName = links[links.length - 1]?.textContent?.trim() || null;
        }
      }
      
      // Pack count - look for "X pack" or "X-pack" or booster box description
      const packsMatch = allText.match(/(\d+)\s*(?:-)?pack/i);
      result.packs = packsMatch ? packsMatch[1] : null;
      
      return result;
    });
    
    console.log('=== TCGPlayer Product Data ===');
    console.log('Product Name:', data.productName || 'NOT FOUND');
    console.log('Set Name:', data.setName || 'NOT FOUND');
    console.log('Market Price:', data.marketPrice || 'NOT FOUND');
    console.log('Lowest Listing Price:', data.lowestListing || 'NOT FOUND');
    console.log('Packs:', data.packs || 'NOT FOUND');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
