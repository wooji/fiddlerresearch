#!/usr/bin/env node
/**
 * Re-match players from existing set-history-sports.json chaseCards
 * Uses improved cleanParsedName to handle noise like "Luka Doncic Contenders"
 * No eBay scraping needed - works on already-scraped data
 */
import { readFileSync, writeFileSync } from 'fs';

const SPORTS_DB = 'set-history-sports.json';
const PLAYERS_DB = 'player-history-sports.json';

const SUFFIX_NOISE = new Set([
  'signatures','contenders','prizmatrix','spectra','inception','sensational','geometric',
  'throwback','rookies','wnba','picks','rpa','few','true','ucc','reverence','redeemed',
  'stars','future','auto','autograph','patch','refractor','parallel','variation','ssp',
  'base','insert','numbered','printing','plate','chrome','hobby','retail','draft','bowman',
  'panini','topps','prizm','immaculate','treasures','national','bowman',
]);

function normalizeName(n) {
  return n.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function cleanParsedName(name) {
  const parts = normalizeName(name).split(' ');
  while (parts.length > 2 && SUFFIX_NOISE.has(parts[parts.length - 1])) parts.pop();
  while (parts.length > 2 && SUFFIX_NOISE.has(parts[0])) parts.shift();
  return parts.join(' ');
}

function matchPlayer(playerName, players) {
  const norm = normalizeName(playerName);
  const cleaned = cleanParsedName(playerName);

  for (const [slug, p] of Object.entries(players)) {
    if (p.name && normalizeName(p.name) === norm) return slug;
  }
  for (const [slug, p] of Object.entries(players)) {
    if (p.name && normalizeName(p.name) === cleaned) return slug;
  }

  const parts = cleaned.split(' ');
  if (parts.length < 2) return null;
  const [first, last] = [parts[0], parts[parts.length - 1]];
  if (first.length < 2 || last.length < 2) return null;

  for (const [slug, p] of Object.entries(players)) {
    if (!p.name) continue;
    const pn = normalizeName(p.name);
    if (pn.includes(first) && pn.includes(last)) return slug;
  }
  return null;
}

const sportsDb = JSON.parse(readFileSync(SPORTS_DB, 'utf8'));
const playersDb = JSON.parse(readFileSync(PLAYERS_DB, 'utf8'));
const sets = sportsDb.sets || {};
const players = playersDb.players || {};

let totalMatched = 0;
let totalCards = 0;

for (const [setKey, setRecord] of Object.entries(sets)) {
  const chaseCards = setRecord.cards?.chaseCards ?? [];
  if (!chaseCards.length) continue;

  const setName = setRecord.name || setRecord.tcgName || setKey;
  let matched = 0;

  for (const card of chaseCards) {
    totalCards++;
    const playerSlug = matchPlayer(card.player, players);
    if (!playerSlug) continue;

    const player = players[playerSlug];
    if (!player.cards) player.cards = [];

    const existing = player.cards.find(c => c.setName === setName && c.cardType === card.cardType);
    if (!existing) {
      player.cards.push({
        setName,
        cardType: card.cardType,
        printRun: card.printRun ?? null,
        estPrice: card.price,
        star: card.price > 200,
        source: 'ebay-sold-comps',
        addedAt: new Date().toISOString().slice(0, 10),
      });
    }
    matched++;
  }

  if (matched > 0) {
    console.log(`[${setName}] → ${matched}/${chaseCards.length} matched`);
    totalMatched += matched;
  }
}

// Save
writeFileSync(PLAYERS_DB, JSON.stringify(playersDb.players ? { ...playersDb, players } : players, null, 2));
console.log(`\nDone: ${totalMatched}/${totalCards} matched, ${Object.keys(players).filter(k=>players[k].cards?.length>0).length} players with cards`);
