#!/bin/bash
# Count inbound emails in DB not yet delivered to helpdesk.
# Run on prod: cd ~/notifications-microservice && ./scripts/count-undelivered-emails.sh

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

DB_HOST="${DB_HOST:-db-server-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-notifications}"
DB_USER="${DB_USER:-dbadmin}"

# SQL in file to avoid quoting issues
SQL_FILE="${SCRIPT_DIR}/count-undelivered.sql"
cat > "$SQL_FILE" << 'EOSQL'
SELECT COUNT(*) FROM inbound_emails e
WHERE e.id NOT IN (
  SELECT wd.inbound_email_id
  FROM webhook_deliveries wd
  INNER JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
  WHERE ws."serviceName" = 'helpdesk' AND wd.status = 'delivered'
);
EOSQL

docker exec -i db-server-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -A < "$SQL_FILE"
rm -f "$SQL_FILE"
