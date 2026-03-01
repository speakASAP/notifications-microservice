#!/bin/bash
# Delete from DB all inbound emails that are "Delivery Status Notification (Failure)"
# from MAILER-DAEMON@amazonses.com so they are never delivered to helpdesk.
# Run on prod: cd ~/notifications-microservice && ./scripts/delete-bounce-notifications.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Load DB vars from .env
if [ -f .env ]; then
  for key in DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD; do
    val=$(grep "^${key}=" .env 2>/dev/null | sed "s/^${key}=//" | tr -d "\r\n")
    [ -n "$val" ] && export "$key=$val"
  done
fi

DB_NAME="${DB_NAME:-notifications}"
DB_USER="${DB_USER:-dbadmin}"

echo "Counting bounce notifications (MAILER-DAEMON@amazonses.com, subject 'Delivery Status Notification (Failure)')..."
SQL_COUNT=$(cat << 'EOSQL'
SELECT COUNT(*) FROM inbound_emails
WHERE "from" = 'MAILER-DAEMON@amazonses.com'
  AND subject LIKE '%Delivery Status Notification (Failure)%';
EOSQL
)
COUNT=$(echo "$SQL_COUNT" | docker exec -i db-server-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -A)
echo "Found: $COUNT rows to delete"

# Of these, how many are currently "undelivered" (no helpdesk delivered)? That is how much undelivered count will drop.
SQL_UNDEL=$(cat << 'EOSQL'
SELECT COUNT(*) FROM inbound_emails e
WHERE e."from" = 'MAILER-DAEMON@amazonses.com'
  AND e.subject LIKE '%Delivery Status Notification (Failure)%'
  AND e.id NOT IN (
    SELECT wd.inbound_email_id FROM webhook_deliveries wd
    INNER JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
    WHERE ws."serviceName" = 'helpdesk' AND wd.status = 'delivered'
  );
EOSQL
)
UNDEL=$(echo "$SQL_UNDEL" | docker exec -i db-server-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -A)
echo "Of these, $UNDEL are currently undelivered to helpdesk (undelivered count will drop by $UNDEL; the rest were already delivered)."

if [ "${COUNT:-0}" -eq 0 ]; then
  echo "Nothing to delete."
  exit 0
fi

echo "Deleting (webhook_deliveries will cascade if FK is set)..."
SQL_DELETE=$(cat << 'EOSQL'
DELETE FROM inbound_emails
WHERE "from" = 'MAILER-DAEMON@amazonses.com'
  AND subject LIKE '%Delivery Status Notification (Failure)%';
EOSQL
)
echo "$SQL_DELETE" | docker exec -i db-server-postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1
echo "Done."
exit 0
