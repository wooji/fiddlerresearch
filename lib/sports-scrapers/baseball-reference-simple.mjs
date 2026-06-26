/**
 * Simple baseball-reference scraper using fetch + regex parsing
 * No Playwright/browser overhead - direct HTTP requests
 */

export class BaseballReferenceSimpleScraper {
  constructor() {
    this.baseUrl = 'https://www.baseball-reference.com/players';
  }

  async scrapePlayer(playerSlug) {
    const url = `${this.baseUrl}/${playerSlug[0].toLowerCase()}/${playerSlug}.shtml`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 15000,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      return this.parsePlayerPage(html);
    } catch (e) {
      console.error(`[baseball-simple] fetch failed for ${playerSlug}:`, e.message);
      return null;
    }
  }

  parsePlayerPage(html) {
    const result = {
      name: null,
      position: null,
      bats: null,
      throws: null,
      height: null,
      weight: null,
      born_date: null,
      born_place: null,
      debut: { date: null, team: null },
      draft: { year: null, round: null, pick: null, team: null },
      awards: { allstar: [], mvp: [], silver_slugger: [] },
      stats: {},
    };

    try {
      // Name
      const h1Match = html.match(/<h1[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/);
      if (h1Match) result.name = h1Match[1].replace(/<[^>]+>/g, '').trim().split('\n')[0];

      // Position, Bats, Throws
      const posMatch = html.match(/Position[^\n]*:\s*([^\n<]+)/i);
      if (posMatch) result.position = posMatch[1].trim().split('<')[0];

      const batsMatch = html.match(/Bats[^\n]*:\s*([LR])/i);
      if (batsMatch) result.bats = batsMatch[1];

      const throwsMatch = html.match(/Throws[^\n]*:\s*([LR])/i);
      if (throwsMatch) result.throws = throwsMatch[1];

      // Height/Weight/Born
      const heightMatch = html.match(/Height[^\n]*:\s*([\d'"-]+)/i);
      if (heightMatch) result.height = heightMatch[1].trim();

      const weightMatch = html.match(/Weight[^\n]*:\s*(\d+\s*lb)/i);
      if (weightMatch) result.weight = weightMatch[1].trim();

      const bornMatch = html.match(/Born[^\n]*:\s*([A-Za-z]+\s+\d+,\s+\d{4})\s+in\s+([^<\n]+)/i);
      if (bornMatch) {
        result.born_date = bornMatch[1];
        result.born_place = bornMatch[2].trim();
      }

      // Debut
      const debutMatch = html.match(/Debut[^\n]*:\s*([A-Za-z]+\s+\d+,\s+\d{4})\s+for\s+([A-Z]{2,3})/i);
      if (debutMatch) {
        result.debut = { date: debutMatch[1], team: debutMatch[2] };
      }

      // Draft (if present)
      const draftMatch = html.match(/Draft[^\n]*:\s*(\d+)\s+\((\d+)\s+round,\s+(\d+)\s+pick\)[^\n]*([A-Z]{2,3})?/i);
      if (draftMatch) {
        result.draft = {
          year: parseInt(draftMatch[1]),
          round: parseInt(draftMatch[2]),
          pick: parseInt(draftMatch[3]),
          team: draftMatch[4] || null,
        };
      }

      // Awards (All-Star, MVP, Silver Slugger)
      const allstarMatches = html.match(/All-Star/gi) || [];
      result.awards.allstar = Array(allstarMatches.length).fill(true);

      const mvpMatch = html.match(/MVP[^\n]*/gi);
      if (mvpMatch) result.awards.mvp = mvpMatch;

      const ssMatch = html.match(/Silver Slugger/gi);
      if (ssMatch) result.awards.silver_slugger = Array(ssMatch.length).fill(true);

      // Career stats: all years
      const statsTableMatch = html.match(/<table[^>]*id="batting_standard"[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
      if (statsTableMatch) {
        const tbody = statsTableMatch[1];
        const rows = tbody.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];

        rows.forEach(row => {
          const yearMatch = row.match(/<th[^>]*>(\d{4})/);
          if (!yearMatch) return;
          const year = yearMatch[1];

          const tds = row.match(/<td[^>]*>([^<]*)<\/td>/g) || [];
          const stats = {};

          // G, AB, R, H, AVG, HR, RBI, SB
          if (tds[0]) stats.g = parseInt(tds[0].replace(/<[^>]+>/g, ''));
          if (tds[1]) stats.ab = parseInt(tds[1].replace(/<[^>]+>/g, ''));
          if (tds[2]) stats.r = parseInt(tds[2].replace(/<[^>]+>/g, ''));
          if (tds[3]) stats.h = parseInt(tds[3].replace(/<[^>]+>/g, ''));
          if (tds[5]) {
            const avgText = tds[5].replace(/<[^>]+>/g, '');
            stats.avg = avgText !== '---' ? parseFloat(avgText) : null;
          }
          if (tds[7]) stats.hr = parseInt(tds[7].replace(/<[^>]+>/g, ''));
          if (tds[8]) stats.rbi = parseInt(tds[8].replace(/<[^>]+>/g, ''));
          if (tds[15]) stats.sb = parseInt(tds[15].replace(/<[^>]+>/g, ''));

          if (Object.keys(stats).length) result.stats[year] = stats;
        });
      }

      return result;
    } catch (e) {
      console.error('[baseball-simple] parse error:', e.message);
      return result;
    }
  }
}
