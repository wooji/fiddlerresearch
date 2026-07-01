/**
 * DealernetX sports card product scraper
 * Primary source for product info: parallels, autos, inserts, print runs, pricing
 * Cross-reference with PriceCharting for sealed historical data
 */

export class DealernetXSportsScraper {
  constructor() {
    this.baseUrl = 'https://www.dealernetx.com';
    this.categories = {
      baseball: 'baseball-cards',
      basketball: 'basketball-cards',
      football: 'football-cards',
    };
  }

  async scrapeProductsByCategory(sport) {
    // DISABLED 2026-07-01 — DX account flagged. Do not re-enable without user approval.
    return [];
    const category = this.categories[sport];
    if (!category) return [];

    try {
      // DealernetX product listing for category
      const url = `${this.baseUrl}/products/${category}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
      });

      if (!response.ok) return [];

      const html = await response.text();
      return this.parseProductListing(html, sport);
    } catch (e) {
      console.error(`[dealernetx] scrape failed for ${sport}:`, e.message);
      return [];
    }
  }

  parseProductListing(html, sport) {
    const products = [];

    // Extract product cards: product-name, price, availability
    const productMatches = html.match(/<div[^>]*class="product-card"[^>]*>[\s\S]*?<\/div>/g) || [];

    productMatches.forEach(card => {
      const nameMatch = card.match(/<h3[^>]*>([^<]+)<\/h3>/);
      const priceMatch = card.match(/\$(\d+(?:\.\d{2})?)/);
      const quantityMatch = card.match(/qty[:\s]+(\d+)/i);
      const yearMatch = card.match(/(\d{4})\s+(topps|panini|bowman|flawless)/i);

      if (nameMatch) {
        const product = {
          name: nameMatch[1].trim(),
          sport,
          price: priceMatch ? parseFloat(priceMatch[1]) : null,
          quantity_available: quantityMatch ? parseInt(quantityMatch[1]) : null,
          year: yearMatch ? parseInt(yearMatch[1]) : null,
          brand: yearMatch ? yearMatch[2].toLowerCase() : null,
          source: 'dealernetx',
          fetched_date: new Date().toISOString(),
        };

        // Parse parallels / special cards from name
        product.parallels = this.extractParallels(product.name);
        product.special_cards = this.extractSpecialCards(product.name);

        products.push(product);
      }
    });

    return products;
  }

  extractParallels(name) {
    const parallels = [];
    const patterns = [
      { name: '1/1', pattern: /1\/1|one\s+of\s+one/i },
      { name: '1/5', pattern: /1\/5|one\s+of\s+five/i },
      { name: '1/10', pattern: /1\/10|one\s+of\s+ten/i },
      { name: '1/25', pattern: /1\/25|one\s+of\s+twenty-?five/i },
      { name: 'Gold', pattern: /gold|#d|limited/i },
      { name: 'Red', pattern: /red\s+parallel|ruby/i },
      { name: 'Black', pattern: /black\s+parallel|ebony/i },
      { name: 'Refractor', pattern: /refractor/i },
      { name: 'Autograph', pattern: /auto|signed/i },
    ];

    patterns.forEach(p => {
      if (p.pattern.test(name)) {
        parallels.push(p.name);
      }
    });

    return parallels;
  }

  extractSpecialCards(name) {
    const specials = [];
    const patterns = [
      { type: 'autograph', pattern: /\bauto\b|signed|autographed/i },
      { type: 'game_used', pattern: /game.?used|gu|jersey|bat/i },
      { type: 'memorabilia', pattern: /mem|relic|swatch/i },
      { type: 'rookie_auto', pattern: /rookie\s+auto|rc\s+auto/i },
      { type: 'dual_auto', pattern: /dual\s+auto|dual.?signed/i },
    ];

    patterns.forEach(p => {
      if (p.pattern.test(name)) {
        specials.push(p.type);
      }
    });

    return specials;
  }

  async enrichWithPriceCharting(product) {
    // Cross-reference with PriceCharting for historical sealed data
    try {
      const query = `${product.year} ${product.brand} ${product.name}`
        .replace(/\s+/g, '+');

      const pcUrl = `https://www.pricecharting.com/search?q=${query}&type=sealed`;
      const response = await fetch(pcUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });

      if (response.ok) {
        const html = await response.text();
        const priceMatch = html.match(/\$(\d+(?:\.\d{2})?)/);
        const historyMatch = html.match(/avg[:\s]*\$(\d+(?:\.\d{2})?)/i);

        if (priceMatch) {
          product.pricecharting = {
            current: parseFloat(priceMatch[1]),
            historical_avg: historyMatch ? parseFloat(historyMatch[1]) : null,
            source: 'pricecharting',
          };
        }
      }
    } catch (e) {
      // Silently fail on PC enrichment
    }

    return product;
  }
}
