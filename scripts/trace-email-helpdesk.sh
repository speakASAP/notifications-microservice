#!/bin/bash
# Trace where an inbound email is stuck on the way to helpdesk.
# Finds email by Message-Id (with or without angle brackets) or by from/to in last 7 days,
# then shows: in DB? webhook_deliveries for helpdesk? status?
#
# Usage:
#   ./scripts/trace-email-helpdesk.sh "1772359319.0556817000.g9aprhbf@frv63.fwdcdn.com"
#   ./scripts/trace-email-helpdesk.sh "" "lisapet@ukr.net" "contact@speakasap.com"
# Run on prod: cd ~/notifications-microservice && ./scripts/trace-email-helpdesk.sh "<message-id>" [from] [to]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

MESSAGE_ID_RAW="${1:-}"
FROM="${2:-}"
TO="${3:-}"

# Load DB vars from .env
if [ -f .env ]; then
  for key in DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD; do
    val=$(grep "^${key}=" .env 2>/dev/null | sed "s/^${key}=//" | tr -d "\r\n")
    [ -n "$val" ] && export "$key=$val"
  done
fi

DB_HOST="${DB_HOST:-db-server-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-notifications}"
DB_USER="${DB_USER:-dbadmin}"

echo "=========================================="
echo "Trace email -> helpdesk"
echo "=========================================="
if [ -n "$MESSAGE_ID_RAW" ]; then
  # Strip angle brackets for search (DB may store with or without)
  MESSAGE_ID_SEARCH="${MESSAGE_ID_RAW#<}"; MESSAGE_ID_SEARCH="${MESSAGE_ID_SEARCH%>}"
  echo "Message-Id (search): $MESSAGE_ID_SEARCH"
fi
[ -n "$FROM" ] && echo "From: $FROM"
[ -n "$TO" ] && echo "To: $TO"
echo ""

# Build SQL: find inbound_emails by messageId (rawData->mail->messageId) or by from/to
SQL_FILE="${SCRIPT_DIR}/.trace-email-helpdesk.sql"
if [ -n "$MESSAGE_ID_RAW" ]; then
  # Escape single quote for psql: ' -> ''
  MESSAGE_ID_ESC=$(echo "$MESSAGE_ID_SEARCH" | sed "s/'/''/g")
  cat > "$SQL_FILE" << EOSQL
-- Find by messageId (stored with or without angle brackets)
SELECT id, "from", "to", subject, "receivedAt", status
FROM inbound_emails
WHERE ("rawData"->'mail'->>'messageId' = '$MESSAGE_ID_ESC'
   OR "rawData"->'mail'->>'messageId' = '<' || '$MESSAGE_ID_ESC' || '>')
ORDER BY "receivedAt" DESC
LIMIT 5;
EOSQL
elif [ -n "$FROM" ] || [ -n "$TO" ]; then
  FROM_ESC=$(echo "$FROM" | sed "s/'/''/g")
  TO_ESC=$(echo "$TO" | sed "s/'/''/g")
  cat > "$SQL_FILE" << EOSQL
-- Find by from/to in last 7 days
SELECT id, "from", "to", subject, "receivedAt", status
FROM inbound_emails
WHERE "receivedAt" > NOW() - INTERVAL '7 days'
  AND ('' = '$FROM_ESC' OR "from" LIKE '%' || '$FROM_ESC')
  AND ('' = '$TO_ESC' OR "to" LIKE '%' || '$TO_ESC')
ORDER BY "receivedAt" DESC
LIMIT 5;
EOSQL
else
  echo "Usage: $0 \"<message-id>\"   OR   $0 \"\" \"from@example.com\" \"to@example.com\""
  exit 1
fi

echo "1. Inbound email(s) in DB"
echo "-------------------------"
FOUND=$(docker exec -i db-server-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -A -F'|' < "$SQL_FILE" 2>/dev/null) || true
rm -f "$SQL_FILE"

if [ -z "$FOUND" ] || [ "$FOUND" = "" ]; then
  echo "  Not found in inbound_emails."
  echo "  -> Stuck before notifications: S3 event not received, or SNS not calling /email/inbound/s3, or processEmailFromS3 failed. Check container logs and central logging for CONTROLLER, S3_PROCESS, WEBHOOK_DELIVERY."
  exit 0
fi

echo "$FOUND" | while IFS='|' read -r id from to subject received_at status; do
  [ -z "$id" ] && continue
  echo "  id: $id"
  echo "  from: $from"
  echo "  to: $to"
  echo "  subject: $subject"
  echo "  receivedAt: $received_at"
  echo "  status: $status"
  echo ""

  echo "2. Webhook deliveries for this email (helpdesk)"
  echo "-----------------------------------------------"
  WSQL="SELECT wd.id, wd.status, wd.http_status, wd.\"deliveredAt\", ws.\"serviceName\", ws.webhook_url
FROM webhook_deliveries wd
JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
WHERE wd.inbound_email_id = '$id'
  AND ws.\"serviceName\" = 'helpdesk';"
  WRESULT=$(docker exec -i db-server-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -A -F'|' -c "$WSQL" 2>/dev/null) || true
  if [ -z "$WRESULT" ] || [ "$WRESULT" = "" ]; then
    echo "  No helpdesk delivery row."
    echo "  -> Filter did not match (*@speakasap.com), or health check failed, or deliverToSubscriptions threw before creating row. Check logs: WEBHOOK_DELIVERY, Filter check result, Successfully delivered, Exception caught."
  else
    echo "$WRESULT" | while IFS='|' read -r wd_id wd_status http_status delivered_at svc_name webhook_url; do
      echo "  delivery_id: $wd_id  status: $wd_status  http_status: $http_status  deliveredAt: $delivered_at"
      echo "  webhook: $webhook_url"
      if [ "$wd_status" = "delivered" ]; then
        echo "  -> Marked delivered (2xx). If ticket missing, check speakasap-portal/Celery and helpdesk webhook handler."
      elif [ "$wd_status" = "sent" ]; then
        echo "  -> Sent but not confirmed. Helpdesk may not have called delivery-confirmation, or Celery task failed."
      else
        echo "  -> Delivery failed or pending. Check logs for Exception caught."
      fi
    done
  fi
  echo ""
done

echo "Logs (on statex): docker logs --tail 500 \$(docker ps -q -f name=notifications-microservice | head -1) 2>&1 | grep -E 'CONTROLLER|S3_PROCESS|WEBHOOK_DELIVERY|Filter check|Successfully delivered|Exception caught'"
echo "Or central logging: https://logging.statex.cz service=notifications-microservice"
