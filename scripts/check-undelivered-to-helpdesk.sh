#!/bin/bash
# Check inbound emails that were sent to helpdesk webhook but not yet confirmed delivered.
# Delivery is confirmed when helpdesk creates a ticket/comment and calls delivery-confirmation.
# Run on prod: ssh statex 'cd ~/notifications-microservice && ./scripts/check-undelivered-to-helpdesk.sh'

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

LIMIT="${1:-100}"
BASE_URL="${NOTIFICATIONS_BASE_URL:-https://notifications.statex.cz}"

echo "=========================================="
echo "Check undelivered to helpdesk (limit=$LIMIT)"
echo "=========================================="
echo ""

# 1. Try API first
echo "1. Querying API GET $BASE_URL/email/inbound/undelivered?limit=$LIMIT ..."
if response=$(curl -s -w "\n%{http_code}" "$BASE_URL/email/inbound/undelivered?limit=$LIMIT" 2>/dev/null); then
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  if [ "$http_code" = "200" ]; then
    count=$(echo "$body" | grep -o '"inboundEmailId"' | wc -l | tr -d ' ')
    if [ "$count" -gt 0 ]; then
      echo -e "${YELLOW}Found $count webhook delivery(ies) not yet confirmed by helpdesk:${NC}"
      echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
    else
      echo -e "${GREEN}✓ No undelivered records (all helpdesk webhooks confirmed or none sent).${NC}"
    fi
  else
    echo -e "${RED}API returned HTTP $http_code${NC}"
    echo "$body"
  fi
else
  echo -e "${YELLOW}API request failed (e.g. service down). Trying DB...${NC}"
fi
echo ""

# 2. Optional: direct DB query (if psql and .env available)
if [ -f .env ] && command -v psql &>/dev/null; then
  echo "2. Database: webhook_deliveries with status='sent' (helpdesk)..."
  source .env
  DB_HOST="${DB_HOST:-db-server-postgres}"
  DB_PORT="${DB_PORT:-5432}"
  DB_USER="${DB_USER:-dbadmin}"
  DB_NAME="${DB_NAME:-notifications}"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT wd.id, wd.inbound_email_id, wd.subscription_id, wd.created_at, ws.\"serviceName\"
    FROM webhook_deliveries wd
    JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
    WHERE wd.status = 'sent' AND LOWER(ws.\"serviceName\") = 'helpdesk'
    ORDER BY wd.created_at DESC
    LIMIT $LIMIT;
  " 2>/dev/null || echo "  (psql failed - check DB connection)"
else
  echo "2. Skip DB (no .env or psql)"
fi
echo ""
echo "Done. Confirmations are sent by helpdesk when a ticket/comment is created."
