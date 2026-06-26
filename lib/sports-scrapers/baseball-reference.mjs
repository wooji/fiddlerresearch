import { BrowserPool } from './concurrent-browser-pool.mjs';

export class BaseballReferenceScraper {
  constructor(proxyListPath, concurrency = 10) {
    this.pool = new BrowserPool(proxyListPath, concurrency);
  }

  async init() {
    await this.pool.init();
  }

  async scrapePlayer(playerSlug) {
    const url = `https://www.baseball-reference.com/players/${playerSlug[0].toLowerCase()}/${playerSlug}/`;
    try {
      const data = await this.pool.fetchPage(url, this.extractPlayerData);
      return data;
    } catch (e) {
      console.error(`[baseball-ref] scrape failed for ${playerSlug}:`, e.message);
      return null;
    }
  }

  extractPlayerData() {
    // This function runs in browser context with ~2s delay for JS render
    const result = { name: null, position: null, bats: null, throws: null, debut: null, stats: {} };

    try {
      // Name from h1
      const h1 = document.querySelector('h1');
      if (h1) result.name = h1.textContent.split('\n')[0].trim();

      // Get all visible text and search for basic info
      const allText = document.body.innerText || '';

      // Simple text parsing for key info
      const posMatch = allText.match(/Position:\s*([^\n]+)/);
      if (posMatch) result.position = posMatch[1].trim();

      const batsMatch = allText.match(/Bats:\s*([LRS])/);
      if (batsMatch) result.bats = batsMatch[1];

      const throwsMatch = allText.match(/Throws:\s*([LRS])/);
      if (throwsMatch) result.throws = throwsMatch[1];

      const debutMatch = allText.match(/Debut:\s*([A-Za-z]+ \d+, \d{4})/);
      if (debutMatch) result.debut = { date: debutMatch[1] };

      // Try to find any stats table (could be batting_standard or other variants)
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const id = table.id || '';
        if (id.includes('batting') || id.includes('pitching')) {
          const rows = table.querySelectorAll('tbody tr');
          rows.forEach(row => {
            const th = row.querySelector('th');
            if (!th) return;
            const year = th.textContent.trim();
            if (!year.match(/^\d{4}$/)) return;

            const cells = Array.from(row.querySelectorAll('td'));
            const stats = {};
            // Try to extract at least a couple key stats
            if (cells.length >= 3) {
              const rawG = cells[0]?.textContent.trim();
              const rawAvg = cells[2]?.textContent.trim();
              if (rawG && rawG !== '---' && !isNaN(rawG)) stats.g = parseInt(rawG);
              if (rawAvg && rawAvg !== '---' && rawAvg.includes('.')) stats.avg = parseFloat(rawAvg);
            }
            if (Object.keys(stats).length) result.stats[year] = stats;
          });
          break; // use first batting/pitching table found
        }
      }

      return result;
    } catch (e) {
      return result;
    }
  }

  async close() {
    await this.pool.close();
  }
}
