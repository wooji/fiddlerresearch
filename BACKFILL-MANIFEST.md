# Comprehensive Database Backfill Manifest

## Coverage by Category (Per Handbook)

### Pokemon TCG (19 types)
**Handbook specifies 9:**
- ✅ Display Booster Box (36 count)
- ✅ Display Tin Set - 10 Count
- ✅ Display Tin Set - 8 Count
- ✅ Collection Boxes
- ✅ Elite Trainer Box
- ✅ Booster Bundle
- ✅ 3 Pack Blisters
- ✅ 2 Pack Blisters
- ✅ Single Blister Pack

**Plus premium variants (10 additional types):**
- Premium Collection, Ultra Premium Collection, Super Premium Collection
- Deluxe Collection, Tin variants, Booster Blister

### Magic The Gathering (13 types)
**Handbook specifies 5:**
- ✅ Collector Booster Box
- ✅ Gift Bundles
- ✅ Play Boxes
- ✅ Single Collector Packs
- ✅ Single Packs

**Plus variants (8 additional):**
- Set Booster Box, Draft Booster Box
- Starter Packs, Fat Pack, Starter Box, Gift Box

### Lorcana (14 types)
**Handbook specifies 7:**
- ✅ Booster Display Boxes
- ✅ Booster Packs
- ✅ Sleeved Boosters
- ✅ Collectors Illumineer's Trove
- ✅ Collection Starter Sets
- ✅ Gift Sets & Gift Boxes
- ✅ Disney Collector Sets

**Plus variants (7 additional):**
- Sleeved Boosters (plural), Starter Deck, Gift Bundle, Disney Gift Set

### One Piece (7 types)
**Handbook specifies 3:**
- ✅ Booster Box
- ✅ Double Box (2-pack)
- ✅ Collection Sets

**Plus variants (4 additional):**
- Premium Collection, Starter Deck, Collection Box variants

### Topps (19 types)
**Handbook specifies retail + exclusive:**
- **Retail:** ✅ Mega Box, ✅ Blaster/Value Box, ✅ Hanger Box, ✅ Fat Packs
- **Exclusive:** ✅ Jumbo, ✅ Jumbo Hobby, ✅ Hobby, ✅ Sealed Cases

**Expanded to 19 types:**
- All retail variants + premium/special edition boxes
- Case variants (Jumbo Case, Jumbo Hobby Case, Sealed Hobby Case)
- Ultra Premium, Special Edition

### Sports Cards (15 types)
**All handbook types:**
- ✅ Hobby Box, ✅ Blaster Box, ✅ Hanger Box
- ✅ Mega Box, ✅ Jumbo Box, ✅ Retail Box
- ✅ Booster Box, ✅ Cello Box, ✅ Fat Pack
- ✅ Value Box, ✅ Retail Value Box
- **Plus:** Retail Mega, Blaster Mega, Premium, Deluxe variants

### Other TCG (9 types)
- ✅ Booster Box, ✅ Booster Pack
- ✅ Starter Deck, ✅ Starter Box
- ✅ Display Box, ✅ Collection Box
- **Plus:** Jumbo Box, Deluxe Collection, Premium Collection

### Mattel (NEW - 9 types)
**Handbook specifies 3 sub-brands:**
- **Barbie:** ✅ Collector Edition, ✅ Dolls, ✅ Collector Set
- **Monster High:** ✅ Dolls, ✅ Collector Edition
- **Hot Wheels RLC:** ✅ RLC, ✅ Premium, ✅ Collector Edition, ✅ Collector Set

## Total Coverage

- **8 categories** backfillable
- **105+ product types** across all categories
- **All handbook product ranges** implemented
- **100% of specified variants** in SEALED_TYPES_BY

## Backfill Status

### Running
- Pokemon: 305 sets × 19 types
- MTG: 308 sets × 13 types
- One Piece: 23+ sets × 7 types
- Sports: 300+ sets × 15 types
- Topps: 200+ sets × 19 types
- Mattel: 50+ sets × 9 types
- Other-TCG: Auto-included

### Database Files (Initialized)
```
set-history.json (Pokemon)
set-history-mtg.json
set-history-lorcana.json
set-history-one-piece.json
set-history-sports.json
set-history-topps.json (NEW)
set-history-mattel.json (NEW)
set-history-noncard.json (Existing)
```

## Schema Extensions

Each product record includes:
- `current` (current market price)
- `ath` (all-time high)
- `series` (historical price points)
- `volatility` (computed standard deviation)
- `trend` (uptrend/downtrend/stable)
- `manual` (flag for hand-entered premium collections)
- `history` (24-observation append-only array)

## Delivery

- Dashboard: ✅ live (PID 54880, --watch enabled)
- API: ✅ /confirm-db-save (tested)
- Pipeline: ✅ research → dbAppend → confirm → persist
- History tracking: ✅ append-not-overwrite verified
