# Category-Specific Product Mechanics
> **Captures:** Per-category pricing mechanics — Lorcana/Sports/MTG/LEGO/Noncard retail anchors, reprint risk tiers, hold vs flip thesis, eBay query format per category.
> **See also:** `RATING-LOGIC.md` (how category informs rating) · `FIDDLER.md` (search query rules per category)

Read this before writing any market analysis. Each category has distinct pricing mechanics.
Never apply Pokemon mechanics to non-Pokemon. Never apply Lorcana blister mechanics to booster boxes.

---

## One Piece TCG (Bandai)

**Reprint risk: MODERATE** — Bandai releases ~1 reprint wave per set, typically 3-6 months post-release. More stable floor than Lorcana; weaker appreciation than Pokemon Hobby.

| Product | Retail | Thesis | Notes |
|---------|--------|--------|-------|
| Booster Box (24pk) | $120 | OOS at retail → secondary premium. S-tier IP (Luffy/Shanks/Roger) = 4-7× sustained. Buy on release, hold 3-6mo | Exit before Bandai reprint wave. Monitor stock announcements |

**IP tiers (gates ATH ceiling):**
- **S-tier**: Luffy (OP01, OP13), Shanks+Roger (OP08), Kaido+Big Mom (OP09) → 4-7× ATH  
- **A-tier**: Whitebeard, Law, Kid, Yamato-era sets → 2-4× ATH
- **B/C-tier**: Supporting character sets → 1.2-2× (revert near retail post-reprint)

**eBay query format**: `one piece [set name] OP-[XX] booster box English` — e.g. `one piece carrying on his will OP-13 booster box English`  
**DB**: `set-history-one-piece.json` · **Category key**: `one_piece`

---

## Disney Lorcana

**Reprint risk: STRUCTURAL** — Ravensburger has reprinted EVERY chapter within 6 months. This is the #1 risk for ALL Lorcana sealed.

| Product | Retail | Thesis | Ceiling |
|---------|--------|--------|---------|
| Booster Box (24pk) | $120 | Primary flip target. OOS → 1.2-1.8× secondary. Buy on release, sell first spike | Reprint kills premium. No hold past 3mo |
| Single Booster / Blister | $6 | OOS flip ONLY. Track when box OOS → singles spike. Thin market ($200-500/mo). | Light Send at best — can't deploy size |
| Illumineer's Trove | $30 | 1.1-1.5× on OOS. Moderate depth | Same reprint risk |
| Starter Deck | $15 | Gameplay product. No secondary value | Skip |

**Set Scoring**: Fabled = S tier (7× ATH, OOS permanent). First Chapter = A tier (3.3× sustained). Active sets = C/D until OOS confirmed.

**eBay query format**: `Disney Lorcana [Set Name] [product type]` — e.g. `Disney Lorcana Wilds of the Unknown blister single pack`

---

## Sports Cards (Topps / Panini / Bowman)

**Hobby = fixed print run, no reprint.** Retail/Blaster = continuous restock, no hold thesis.

| Product | Retail | Thesis | Ceiling |
|---------|--------|--------|---------|
| Hobby Box | ~$200 | Fixed print. Appreciates 1.3-1.8× with strong rookie class. Buy sealed, hold 6-12mo | RC class quality gates everything |
| Jumbo/HTA Box | ~$250 | Fewer boxes/case, more autos/relics. 1.2-1.6× | |
| Mega Box (Target) | ~$30 | Better hits than blaster. 0.9-1.1×. OOS spike only | Restocks → no hold |
| Blaster Box | ~$22 | Continuous restock. 0.8-1.0×. Flip ONLY on OOS spike | Never hold |
| Hanger Pack | ~$10 | Commons only. No premium. Skip | |

**RC class proxy**: If prior year same set appreciated, current year likely similar IF rookie class is strong (check Blowout Forums + YouTube break EV).

**eBay query format**: `[year] [set name] hobby box` — e.g. `2026 Topps Chrome Baseball hobby box`

---

## Magic: The Gathering (MTG)

**Secret Lair = LIMITED PRINT RUN since Feb 2026** (confirmed WeeklyMTG). No longer print-on-demand. Sealed can appreciate.

| Product | Retail | Thesis | Ceiling |
|---------|--------|--------|---------|
| Collector Booster Box | $324 | 100% rares + exclusive foils. 0.5-3.0×. Crossover IP peaks 2-4× | Bleeds after release window without strong singles |
| Play Booster Box | $210 | Draftable. 0.8-1.2×. Trends below MSRP month 2+ | Not a hold |
| Secret Lair | $30-50 | LIMITED PRINT RUN. 1.5-4× sealed hold. Two exits: crack for singles OR hold sealed | Non-IP SL underperforms; crossover IP (Marvel, LOTR, Star Trek) = hold |
| Bundle | $70 | 0.9-1.0×. Neutral | |
| Commander Deck | $50 | 0.9-1.2×. Staple commanders can spike singles | |

**IP strength proxy**: LOTR/Marvel/Star Trek = S tier IP. Crossover drives 2-4× vs original MTG IP 1.0-1.5×.

---

## LEGO

**Retirement = the #1 price driver.** Active sets sell at/below retail. Appreciation forms ONLY post-EOL.

| Stage | Price vs Retail | Action |
|-------|----------------|--------|
| Active (in production) | 80-100% | DO NOT buy for investment. Can buy-and-hold if retirement imminent |
| Retiring Soon (EOL flagged) | 90-110% | Start accumulating if strong IP |
| Retired (1-6mo post-EOL) | 110-150% | Peak buy window |
| Retired (1-3yr) | 150-400% | Hold or sell depending on IP |

**BrickEconomy** = primary price source. Requires `curl` (not node-fetch — Cloudflare blocks).
**Set number** = most precise eBay query. 5-digit set number > set name.

---

## Vinyl / Collectibles (Noncard)

No structural scarcity unless OOP (out of print). IP-driven.

- **OOP + strong IP** → 2-5× appreciated. Hold.
- **Active pressing** → at/below retail. Flip-only on OOS spikes.
- **Celebrity collab / limited variant** → spike on announcement, fade unless IP sustains.

eBay query: `[artist] [album] [variant]` — stripped of format words (LP, vinyl, record).

---

## Cross-Category Rules
1. **Never apply one category's mechanics to another** — Lorcana reprint risk does not apply to Topps Hobby.
2. **Reprint = thesis killer** for Lorcana, MTG Play Box, mass-market Blasters. Not applicable to Hobby/HTA/Secret Lair/LEGO.
3. **Fixed print** (Hobby, Secret Lair, LEGO) = hold thesis valid. **Open print** (Blaster, Booster Pack, active LEGO) = flip-only.
4. **IP strength** gates appreciation for ALL categories. Weak IP = no ceiling expansion regardless of scarcity.
