#!/bin/bash
# Trace a single email by Message-Id (or fragment) and optionally check webhook delivery.
# Usage: ./scripts/trace-email-by-message-id.sh [message_id_fragment]
# Example: ./scripts/trace-email-by-message-id.sh 1772299527.0493579000.d2juj2p5
# Run on statex: ssh statex 'cd ~/notifications-microservice && ./scripts/trace-email-by-message-id.sh 1772299527'

set -e

MSG_FRAG="${1:-}"
if [ -z "$MSG_FRAG" ]; then
  echo "Usage: $0 <message_id_fragment>"
  echo "Example: $0 1772299527.0493579000.d2juj2p5"
  exit 1
fi
# Sanitize for use in LIKE (allow alphanumeric, dots, @, -, _)
MSG_FRAG=$(echo "$MSG_FRAG" | tr -cd 'a-zA-Z0-9.@-_')
[ -z "$MSG_FRAG" ] && echo "Invalid message_id fragment" && exit 1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -f .env ]; then
  echo -e "${RED}.env not found${NC}"
  exit 1
fi

source .env
DB_HOST="${DB_HOST:-db-server-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-dbadmin}"
DB_NAME="${DB_NAME:-notifications}"
export PGPASSWORD="${DB_PASSWORD}"

echo "=========================================="
echo "Trace email by message_id fragment: $MSG_FRAG"
echo "=========================================="
echo ""

# Escape single quote for SQL
LIKE_PAT="%${MSG_FRAG}%"
LIKE_PAT_ESC="${LIKE_PAT//\'/\'\'}"
echo "1. inbound_emails (raw email in DB):"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -F'|' -c "
  SELECT id, \"from\", \"to\", subject, \"receivedAt\", status,
    \"rawData\"->'mail'->>'messageId' as message_id
  FROM inbound_emails
  WHERE \"rawData\"->'mail'->>'messageId' LIKE '$LIKE_PAT_ESC'
     OR (\"to\" = 'stashok@speakasap.com' AND \"receivedAt\"::text LIKE '2026-02-28%')
  ORDER BY \"receivedAt\" DESC
  LIMIT 10;
" 2>/dev/null || { echo "  (psql failed)"; true; }

echo ""
echo "2. webhook_deliveries for helpdesk (for above inbound_email_id):"
# Get inbound_email ids from step 1 and check deliveries
INBOUND_IDS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "
  SELECT id FROM inbound_emails
  WHERE \"rawData\"->'mail'->>'messageId' LIKE '$LIKE_PAT_ESC'
     OR (\"to\" = 'stashok@speakasap.com' AND \"receivedAt\"::text LIKE '2026-02-28%')
  ORDER BY \"receivedAt\" DESC LIMIT 5;
" 2>/dev/null | tr -d ' ' | paste -sd, -)
if [ -n "$INBOUND_IDS" ]; then
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT wd.id, wd.inbound_email_id, wd.status, wd.created_at, ws.\"serviceName\", ws.\"webhookUrl\"
    FROM webhook_deliveries wd
    JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
    WHERE wd.inbound_email_id IN ($INBOUND_IDS) AND LOWER(ws.\"serviceName\") = 'helpdesk'
    ORDER BY wd.created_at DESC;
  " 2>/dev/null || true
else
  echo "  (no matching inbound_emails found)"
fi

echo ""
echo "3. Recent docker logs (notifications) for this message-id or stashok:"
CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -m1 notifications || true)
if [ -n "$CONTAINER" ]; then
  docker logs "$CONTAINER" 2>&1 | grep -E "1772299527|stashok@speakasap|d2juj2p5" | tail -30
else
  echo "  (container not found)"
fi
