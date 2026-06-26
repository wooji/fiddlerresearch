/**
 * Enumerate all player IDs from baseball-reference a-z pages with proxy rotation
 */

import { readFileSync } from 'fs';
import { join } from 'path';

function loadProxies(file) {
  try {
    return readFileSync(join('.', file), 'utf8').split('\n').map(l => l.trim()).filter(l => l);
  } catch {
    return [];
  }
}

export class PlayerIdEnumerator {
  constructor() {
    this.isps = loadProxies('ISP.txt');
    this.ispIdx = 0;
    this.retries = 3;
  }

  getProxyUrl(proxy, type = 'isp') {
    if (type === 'isp') {
      const [host, port, user, pass] = proxy.split(':');
      return `http://${user}:${pass}@${host}:${port}`;
    }
    return null;
  }

  async fetchWithProxy(url) {
    const backoffs = [30000, 60000, 120000]; // 30s, 60s, 120s escalation

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        // Try ISP proxy first
        if (this.isps.length > 0) {
          const proxy = this.isps[this.ispIdx % this.isps.length];
          this.ispIdx++;
          const proxyUrl = this.getProxyUrl(proxy, 'isp');

          try {
            const response = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
              timeout: 25000,
              // Note: Node.js fetch doesn't support http_proxy param directly
              // Proxy handling requires HttpAgent/HttpsAgent setup (skipped for now, use direct)
            });

            if (response.ok) return await response.text();
            if (response.status === 429) {
              const waitMs = backoffs[attempt];
              console.log(`    [429] wait ${waitMs}ms, retry ${attempt + 1}/${this.retries}`);
              await new Promise(r => setTimeout(r, waitMs));
              continue;
            }
            return null;
          } catch (e) {
            // Proxy fetch failed, continue to next attempt
          }
        }

        // Fallback: direct fetch
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 25000,
        });

        if (response.ok) return await response.text();
        if (response.status === 429) {
          const waitMs = backoffs[attempt];
          console.log(`    [429] wait ${waitMs}ms, retry ${attempt + 1}/${this.retries}`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        return null;
      } catch (e) {
        console.log(`    error attempt ${attempt + 1}: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    return null;
  }

  async enumerateBaseballReferencePlayers() {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const allPlayers = [];

    for (const letter of letters) {
      try {
        const url = `https://www.baseball-reference.com/players/${letter}/`;
        const html = await this.fetchWithProxy(url);

        if (!html) {
          console.log(`  [${letter}] failed after retries`);
          continue;
        }

        // Extract player links: /players/l/lastname01.shtml
        const playerMatches = html.match(/href="\/players\/[a-z]\/[a-z]+\d{2}\.shtml"/g) || [];
        const slugs = playerMatches.map(m => {
          const match = m.match(/\/players\/([a-z])\/([a-z]+\d{2})\.shtml/);
          return match ? match[2] : null;
        }).filter(Boolean);

        allPlayers.push(...slugs);
        console.log(`  [${letter}] ${slugs.length} players`);
      } catch (e) {
        console.error(`  [${letter}] error:`, e.message);
      }
    }

    console.log(`\n✓ Total players enumerated: ${allPlayers.length}`);
    return [...new Set(allPlayers)]; // dedupe
  }

  async enumerateBasketballReferencePlayers() {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const allPlayers = [];

    for (const letter of letters) {
      try {
        const url = `https://www.basketball-reference.com/players/${letter}/`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 15000,
        });

        if (!response.ok) continue;

        const html = await response.text();
        const playerMatches = html.match(/href="\/players\/[a-z]\/[a-z]+\d{2}\.html"/g) || [];
        const slugs = playerMatches.map(m => {
          const match = m.match(/\/players\/([a-z])\/([a-z]+\d{2})\.html/);
          return match ? match[2] : null;
        }).filter(Boolean);

        allPlayers.push(...slugs);
        console.log(`  [${letter}] ${slugs.length} players`);
      } catch (e) {
        console.error(`  [${letter}] error:`, e.message);
      }
    }

    console.log(`\n✓ Total players enumerated: ${allPlayers.length}`);
    return [...new Set(allPlayers)];
  }

  async enumerateFootballReferencePlayers() {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const allPlayers = [];

    for (const letter of letters) {
      try {
        const url = `https://www.pro-football-reference.com/players/${letter}/`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 15000,
        });

        if (!response.ok) continue;

        const html = await response.text();
        const playerMatches = html.match(/href="\/players\/[a-z]\/[a-z]+\d{2}\.htm"/g) || [];
        const slugs = playerMatches.map(m => {
          const match = m.match(/\/players\/([a-z])\/([a-z]+\d{2})\.htm/);
          return match ? match[2] : null;
        }).filter(Boolean);

        allPlayers.push(...slugs);
        console.log(`  [${letter}] ${slugs.length} players`);
      } catch (e) {
        console.error(`  [${letter}] error:`, e.message);
      }
    }

    console.log(`\n✓ Total players enumerated: ${allPlayers.length}`);
    return [...new Set(allPlayers)];
  }
}
