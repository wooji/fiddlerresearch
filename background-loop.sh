#!/bin/bash
# Auto-restart on stalls (>120s no output)

while true; do
  echo "[$(date)] Starting background loop..."

  # Check + restart baseball
  if ! pgrep -f "scrape-sport-details.*baseball" > /dev/null; then
    echo "[$(date)] Starting baseball scraper..."
    nohup node scrape-sport-details.mjs baseball > /tmp/bb.log 2>&1 &
  else
    BB_MTIME=$(stat -f %m /tmp/bb.log 2>/dev/null || echo 0)
    BB_AGE=$(($(date +%s) - BB_MTIME))
    if [ "$BB_AGE" -gt 120 ]; then
      echo "[$(date)] Baseball stalled ($BB_AGE sec), restarting..."
      pkill -9 -f "scrape-sport-details.*baseball"
      sleep 2
      nohup node scrape-sport-details.mjs baseball > /tmp/bb.log 2>&1 &
    fi
  fi

  # Check + restart products
  if ! pgrep -f "backfill-products-exhaustive" > /dev/null; then
    echo "[$(date)] Starting products backfill..."
    nohup node backfill-products-exhaustive.mjs > /tmp/products.log 2>&1 &
  else
    PROD_MTIME=$(stat -f %m /tmp/products.log 2>/dev/null || echo 0)
    PROD_AGE=$(($(date +%s) - PROD_MTIME))
    if [ "$PROD_AGE" -gt 120 ]; then
      echo "[$(date)] Products stalled ($PROD_AGE sec), restarting..."
      pkill -9 -f "backfill-products-exhaustive"
      sleep 2
      nohup node backfill-products-exhaustive.mjs > /tmp/products.log 2>&1 &
    fi
  fi

  sleep 30
done
