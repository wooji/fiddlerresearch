/**
 * Links player data to card products for ROI/premium calculation
 * Maps: player rookie year + award status → card set parallels/autos/rarity
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = '.';
const PLAYERS_DB = JSON.parse(readFileSync(join(ROOT, 'player-history-sports.json'), 'utf8'));
const PRODUCTS_DB = JSON.parse(readFileSync(join(ROOT, 'card-products-special.json'), 'utf8'));

export function getPlayerCardValue(playerName, cardSetKey) {
  // Find player in DB
  const playerKey = Object.keys(PLAYERS_DB.players).find(k =>
    PLAYERS_DB.players[k].name?.toLowerCase() === playerName.toLowerCase()
  );

  if (!playerKey) return null;

  const player = PLAYERS_DB.players[playerKey];
  const set = PRODUCTS_DB.sets[cardSetKey];

  if (!set || !player.debut) return null;

  // Extract rookie year from debut date
  const debutYear = player.debut.date ? parseInt(player.debut.date.split(',')[1]) : null;
  const setYear = set.release_date ? parseInt(set.release_date.split('-')[0]) : null;

  if (!debutYear || !setYear) return null;

  const isRookie = setYear === debutYear || setYear === debutYear + 1;

  // Base value calculation
  const baseRCValue = 50; // Base rookie card value

  let rcMultiplier = 1;

  // Adjust for draft position
  if (player.draft?.pick) {
    if (player.draft.pick <= 5) rcMultiplier *= 1.8;
    else if (player.draft.pick <= 10) rcMultiplier *= 1.5;
    else if (player.draft.pick <= 25) rcMultiplier *= 1.25;
  }

  // Adjust for awards
  if (player.awards?.allstar?.length > 0) rcMultiplier *= 1.3;
  if (player.awards?.mvp?.length > 0) rcMultiplier *= 2.0;
  if (player.awards?.silver_slugger?.length > 0) rcMultiplier *= 1.2;

  // Calculate special card premiums
  const specialCardValues = set.special_cards
    .filter(sc => isRookie || !sc.sub_type?.includes('rookie'))
    .map(sc => {
      const printRun = parseInt(sc.print_run?.split('/')[1] || '0') || 1;
      const basePremium = sc.price_premium_usd || 0;

      // Adjust premium for star players
      let adjustedPremium = basePremium;
      if (player.awards?.mvp?.length) adjustedPremium *= 1.5;
      else if (player.awards?.allstar?.length) adjustedPremium *= 1.2;

      return {
        card_type: `${sc.type}_${sc.print_run}`,
        est_value: adjustedPremium,
        print_run: printRun,
        rarity: `1/${printRun}`,
      };
    });

  // Calculate parallel premiums
  const parallelValues = set.parallels
    .map(p => ({
      name: p.name,
      est_value: (baseRCValue * rcMultiplier) * (1 + p.price_premium_pct / 100),
      rarity: p.rarity,
    }));

  return {
    player_name: player.name,
    set_name: set.set_name,
    is_rookie_card: isRookie,
    draft_position: player.draft?.pick,
    debut_year: debutYear,
    awards: player.awards,
    base_rc_value: baseRCValue * rcMultiplier,
    parallels: parallelValues,
    special_cards: specialCardValues,
    rookie_class_strength: set.rookie_class_strength,
  };
}

export function getSetRookieClassValue(cardSetKey) {
  const set = PRODUCTS_DB.sets[cardSetKey];
  if (!set) return null;

  const setYear = parseInt(set.release_date?.split('-')[0]);
  if (!setYear) return null;

  // Find all players with debut that year
  const rookieCards = Object.values(PLAYERS_DB.players)
    .filter(p => p.debut?.date && parseInt(p.debut.date.split(',')[1]) === setYear)
    .filter(p => p.name)
    .map(p => ({
      name: p.name,
      draft_pick: p.draft?.pick,
      is_allstar: (p.awards?.allstar?.length || 0) > 0,
      is_mvp: (p.awards?.mvp?.length || 0) > 0,
    }))
    .sort((a, b) => (a.draft_pick || 999) - (b.draft_pick || 999));

  // Score rookie class
  const draftQuality = rookieCards.filter(r => r.draft_pick && r.draft_pick <= 10).length;
  const starQuality = rookieCards.filter(r => r.is_mvp || r.is_allstar).length;

  return {
    set_name: set.set_name,
    rookie_year: setYear,
    rookie_count: rookieCards.length,
    top_10_picks: draftQuality,
    star_count: starQuality,
    strength_rating: set.rookie_class_strength,
    top_rookies: rookieCards.slice(0, 10),
  };
}
