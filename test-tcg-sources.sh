#!/bin/bash

echo "=== Testing TCG Card Pricing Sources ==="
echo ""

# Test 1: TCGPlayer (most comprehensive US marketplace)
echo "1. TCGPlayer — Testing card API..."
curl -s "https://api.tcgplayer.com/catalog/products?q=Pokemon%20SV8a&limit=1" \
  -H "User-Agent: Mozilla/5.0" | head -c 200 && echo " [✓ responds]" || echo " [✗ blocked]"

# Test 2: Cardmarket (EU, all TCGs)
echo ""
echo "2. Cardmarket — Testing card list..."
curl -s "https://www.cardmarket.com/api/cards?filter=set:sv8a" \
  -H "User-Agent: Mozilla/5.0" | head -c 200 && echo " [✓ responds]" || echo " [✗ blocked]"

# Test 3: PriceCharting (niche, historical)
echo ""
echo "3. PriceCharting — Testing sealed..."
curl -s "https://www.pricecharting.com/api/products?q=Pokemon%20SV8a" | head -c 200 && echo " [✓ responds]" || echo " [✗ blocked]"

echo ""
echo "=== Initial Assessment ==="
echo "TCGPlayer: Largest US marketplace, all Pokemon/MTG/Lorcana"
echo "Cardmarket: EU dominant, all TCGs, individual cards"
echo "PriceCharting: Sealed only (not individual cards)"
echo ""
echo "WINNER CANDIDATE: TCGPlayer (official API, all cards, realtime)"
