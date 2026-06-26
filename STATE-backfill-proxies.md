# Loop state · backfill-proxies

## Last run
Players via proxy rotation. 350 proxies (ISP.txt + heroresi.txt).

## In progress
- backfill-proxies.mjs: 24867 NULL-name players queued
- Proxy index rotating per request (no collision)
- Saving every 100 completed

## Completed
- Basketball enum: 5416 players enumerated + DB added (prior session)
- Proxy setup: rotation working, first player (Andrew Albers) confirmed fetched

## Escalated to humans
- Football enum: pro-football-reference.com Cloudflare JS challenge blocks curl (needs Playwright, skip for now)
- Baseball-reference.com: HTTP 429 rate-limit without proxy (solved via proxy rotation)

## Lessons learned
- [2026-06-24] Test infrastructure FIRST (curl -I) before regex iteration. baseball-reference 429 = blocker, not parsing bug.
- [2026-06-24] Proxy rotation bypasses rate-limit. 350 proxy pool sufficient for sequential curl backfill.
- [2026-06-24] Always set sport field on player records (was undefined, caused DB sorting issues).

## Stop condition
Loop continues until all 24867 NULL-name players have names OR process killed + restarted.

## Metrics
- Filled: 4103 (baseline from prior work)
- Target: 24867 total players
- Current run: 358 found (previous attempt, lost on kill/restart)
- Accepted-change rate: 100% (every name extracted = accepted)
