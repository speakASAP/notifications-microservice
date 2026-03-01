#!/bin/bash
# Drain all undelivered: process every email in DB not yet delivered to helpdesk, and every
# unprocessed S3 object (fetch, store in DB, send to helpdesk). Each successful webhook (2xx)
# is marked delivered, so after this runs to completion you have: every email in DB, every
# email marked delivered to helpdesk. You can then close/delete tickets in helpdesk as needed.
#
# Run on prod: cd ~/notifications-microservice && ./scripts/drain-all-undelivered.sh
# Before draining: set S3_CATCHUP_DISABLED=true and restart so the queue stops growing.
# Optional: delete bounces first: ./scripts/delete-bounce-notifications.sh
# Optional: DB_BATCH=100 S3_BATCH=100 ./scripts/drain-all-undelivered.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Load SERVICE_TOKEN from .env
TOKEN=""
if [ -f .env ]; then
  TOKEN=$(grep "^SERVICE_TOKEN=" .env 2>/dev/null | sed 's/^SERVICE_TOKEN=//' | tr -d "\r\n")
fi
if [ -z "$TOKEN" ]; then
  echo "Error: SERVICE_TOKEN not found in .env"
  exit 1
fi

# Use localhost to avoid proxy timeout; override with NOTIFICATIONS_BASE_URL if needed
BASE_URL="${NOTIFICATIONS_BASE_URL:-http://127.0.0.1:3368}"
DB_BATCH="${DB_BATCH:-50}"
S3_BATCH="${S3_BATCH:-50}"

echo "=========================================="
echo "Drain all undelivered to helpdesk"
echo "=========================================="
echo "API: $BASE_URL  (dbBatch=$DB_BATCH s3Batch=$S3_BATCH)"
echo "Will loop until no more DB undelivered and no more unprocessed S3 keys."
echo ""

ROUND=0
TOTAL_DB=0
TOTAL_S3=0

while true; do
  ROUND=$((ROUND + 1))
  echo "Round $ROUND starting (curl may take several min for ${DB_BATCH}+${S3_BATCH} items)..."
  RESP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    "${BASE_URL}/email/inbound/process-undelivered?dbLimit=${DB_BATCH}&s3MaxKeys=${S3_BATCH}" 2>/dev/null) || true

  if [ -z "$RESP" ]; then
    echo "Round $ROUND: No response (service down?). Stopping."
    exit 1
  fi

  # Parse JSON (python3 or jq)
  DB_PROC=0; DB_FAIL=0; S3_PROC=0; S3_FAIL=0
  if command -v python3 &>/dev/null; then
    VALS=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); db=d.get('db',{}); s3=d.get('s3',{}); print(db.get('processed',0), db.get('failed',0), s3.get('processed',0), s3.get('failed',0))" 2>/dev/null) || true
    set -- $VALS
    DB_PROC=${1:-0}; DB_FAIL=${2:-0}; S3_PROC=${3:-0}; S3_FAIL=${4:-0}
  elif command -v jq &>/dev/null; then
    DB_PROC=$(echo "$RESP" | jq -r '.db.processed // 0')
    DB_FAIL=$(echo "$RESP" | jq -r '.db.failed // 0')
    S3_PROC=$(echo "$RESP" | jq -r '.s3.processed // 0')
    S3_FAIL=$(echo "$RESP" | jq -r '.s3.failed // 0')
  fi
  [ -z "$DB_PROC" ] && DB_PROC=0
  [ -z "$S3_PROC" ] && S3_PROC=0
  [ -z "$DB_FAIL" ] && DB_FAIL=0
  [ -z "$S3_FAIL" ] && S3_FAIL=0

  TOTAL_DB=$((TOTAL_DB + DB_PROC))
  TOTAL_S3=$((TOTAL_S3 + S3_PROC))
  echo "Round $ROUND: db processed=$DB_PROC failed=$DB_FAIL  s3 processed=$S3_PROC failed=$S3_FAIL  (total db=$TOTAL_DB s3=$TOTAL_S3)"

  if [ "${DB_PROC:-0}" -eq 0 ] && [ "${S3_PROC:-0}" -eq 0 ]; then
    echo ""
    echo "Done. No more undelivered DB emails and no more unprocessed S3 keys."
    echo "Total processed this run: db=$TOTAL_DB s3=$TOTAL_S3"
    exit 0
  fi
done
