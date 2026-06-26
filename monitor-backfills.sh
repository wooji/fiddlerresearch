#!/bin/bash
while true; do
  # Check player detail scraper
  DETAIL_MTIME=$(stat -f %m player-details.log 2>/dev/null || echo 0)
  DETAIL_NOW=$(date +%s)
  DETAIL_AGE=$((DETAIL_NOW - DETAIL_MTIME))
  
  if [ "$DETAIL_AGE" -gt 90 ]; then
    echo "[$(date)] Player detail scraper stalled ($DETAIL_AGE sec), restarting..."
    pkill -f rebuild-players-details.mjs
    sleep 2
    node rebuild-players-details.mjs 2>&1 | tee -a player-details.log &
  fi
  
  # Check product backfill
  PROD_MTIME=$(stat -f %m product-backfill.log 2>/dev/null || echo 0)
  PROD_AGE=$((DETAIL_NOW - PROD_MTIME))
  
  if [ "$PROD_AGE" -gt 90 ]; then
    echo "[$(date)] Product backfill stalled ($PROD_AGE sec), restarting..."
    pkill -f rebuild-products-distributed.mjs
    sleep 2
    node rebuild-products-distributed.mjs 2>&1 | tee -a product-backfill.log &
  fi
  
  sleep 30
done
