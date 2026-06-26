#!/bin/bash
# Ultra-simple sequential curl backfill with auto-restart
# Reads NULL players, fetches one-by-one, updates DB

DB="player-history-sports.json"
LOG="backfill-bash.log"
DOMAIN_BASEBALL="baseball-reference.com"
DOMAIN_BASKETBALL="basketball-reference.com"
DOMAIN_FOOTBALL="pro-football-reference.com"

echo "[backfill-bash] starting sequential curl backfill" | tee -a "$LOG"

# Get all NULL-name players
null_players=$(node -e "
const fs=require('fs');
const db=JSON.parse(fs.readFileSync('$DB','utf8'));
Object.entries(db.players)
  .filter(([k,p])=>!p.name)
  .forEach(([k,p])=>console.log(k.split('_')[0]+' '+p.slug));
")

count=0
total=$(echo "$null_players" | wc -l)
echo "[backfill-bash] queued $total NULL players" | tee -a "$LOG"

while IFS=' ' read -r sport slug; do
  ((count++))

  if [ $((count % 50)) -eq 0 ]; then
    echo "[backfill-bash] $count/$total players" | tee -a "$LOG"
  fi

  # Determine domain
  domain="$DOMAIN_BASEBALL"
  [ "$sport" = "basketball" ] && domain="$DOMAIN_BASKETBALL"
  [ "$sport" = "football" ] && domain="$DOMAIN_FOOTBALL"

  url="https://www.$domain/players/${slug:0:1}/${slug}.shtml"

  # Fetch with curl
  html=$(curl -s -A "Mozilla/5.0" --max-time 10 --connect-timeout 5 "$url" 2>/dev/null)

  if [ -z "$html" ] || [ ${#html} -lt 100 ]; then
    continue
  fi

  # Extract name (simple regex)
  name=$(echo "$html" | grep -oP '<h1[^>]*>.*?<span[^>]*>\K[^<]+' | head -1 | sed 's/<[^>]*>//g' | xargs)

  if [ -n "$name" ] && [ ${#name} -gt 1 ]; then
    # Update DB
    node -e "
const fs=require('fs');
const db=JSON.parse(fs.readFileSync('$DB','utf8'));
const key='${sport}_${slug}';
if(db.players[key]) {
  db.players[key].name='$name';
  db.players[key].history=[{date:new Date().toISOString()}];
  fs.writeFileSync('$DB',JSON.stringify(db,null,2));
}
"
  fi

  # Throttle
  sleep 0.1
done <<< "$null_players"

echo "[backfill-bash] COMPLETE: updated DB" | tee -a "$LOG"
