/**
 * Concurrent player scraper with ISP + residential proxy fallback
 * 5 ISP workers + 5 residential workers = 10 concurrent scrapers
 */

import { BaseballReferenceSimpleScraper } from './sports-scrapers/baseball-reference-simple.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

class ProxyScraper {
  constructor() {
    this.isps = this.loadProxies('ISP.txt');
    this.residential = this.loadProxies('heroresi.txt');
    this.scraper = new BaseballReferenceSimpleScraper();
    this.currentIspIdx = 0;
    this.currentResiIdx = 0;
  }

  loadProxies(file) {
    try {
      const content = readFileSync(join('.', file), 'utf8');
      return content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l);
    } catch {
      return [];
    }
  }

  getProxyUrl(proxy, type) {
    if (type === 'isp') {
      // ISP: host:port:user:pass
      const [host, port, user, pass] = proxy.split(':');
      return `http://${user}:${pass}@${host}:${port}`;
    } else {
      // Residential: resi.heroproxies.com:7777:auth:token
      const parts = proxy.split(':');
      const host = parts[0];
      const port = parts[1];
      const auth = `${parts[2]}:${parts[3]}`;
      return `http://${auth}@${host}:${port}`;
    }
  }

  async fetchWithProxy(url, proxy, type) {
    const proxyUrl = this.getProxyUrl(proxy, type);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': `Mozilla/5.0 (${type === 'isp' ? 'ISP' : 'Residential'})`,
        },
        timeout: 15000,
      });
      return response.ok ? await response.text() : null;
    } catch (e) {
      return null;
    }
  }

  async scrapePlayerWithRetry(slug) {
    // Try ISP first
    if (this.isps.length > 0) {
      const isp = this.isps[this.currentIspIdx % this.isps.length];
      this.currentIspIdx++;

      const url = `https://www.baseball-reference.com/players/${slug[0].toLowerCase()}/${slug}.shtml`;
      const html = await this.fetchWithProxy(url, isp, 'isp');

      if (html) {
        try {
          return this.scraper.parsePlayerPage(html);
        } catch {
          return null;
        }
      }
    }

    // Fallback to residential
    if (this.residential.length > 0) {
      const resi = this.residential[this.currentResiIdx % this.residential.length];
      this.currentResiIdx++;

      const url = `https://www.baseball-reference.com/players/${slug[0].toLowerCase()}/${slug}.shtml`;
      const html = await this.fetchWithProxy(url, resi, 'residential');

      if (html) {
        try {
          return this.scraper.parsePlayerPage(html);
        } catch {
          return null;
        }
      }
    }

    // No proxies or all failed, try direct
    try {
      const url = `https://www.baseball-reference.com/players/${slug[0].toLowerCase()}/${slug}.shtml`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });
      if (response.ok) {
        return this.scraper.parsePlayerPage(await response.text());
      }
    } catch {
      return null;
    }

    return null;
  }
}

export class ConcurrentPlayerScraper {
  constructor(concurrency = 10) {
    this.concurrency = concurrency;
    this.proxyScraper = new ProxyScraper();
    this.queue = [];
    this.running = 0;
  }

  async scrapeMany(playerSlugs) {
    return new Promise((resolve) => {
      const results = {};
      let completed = 0;

      const process = async () => {
        while (this.queue.length > 0 && this.running < this.concurrency) {
          this.running++;
          const { slug, idx } = this.queue.shift();

          try {
            const player = await this.proxyScraper.scrapePlayerWithRetry(slug);
            results[slug] = player;

            if (player && player.name) {
              if ((completed + 1) % 10 === 0) {
                console.log(`  ✓ ${completed + 1} / ${playerSlugs.length}`);
              }
            }
          } catch (e) {
            results[slug] = null;
          }

          completed++;
          this.running--;

          if (completed === playerSlugs.length) {
            resolve(results);
          } else {
            process();
          }
        }
      };

      this.queue = playerSlugs.map((slug, idx) => ({ slug, idx }));

      for (let i = 0; i < this.concurrency; i++) {
        process();
      }
    });
  }
}
