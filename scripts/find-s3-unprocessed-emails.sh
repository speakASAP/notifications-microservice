#!/bin/bash

# Find S3 emails that were NOT processed by notifications-microservice
# Compares S3 bucket contents with inbound_emails table (by rawData.receipt.action.objectKey)
# Use on prod: ssh statex "cd ~/notifications-microservice && ./scripts/find-s3-unprocessed-emails.sh"

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Limits
S3_MAX_ITEMS="${S3_MAX_ITEMS:-500}"
DAYS_AGO="${DAYS_AGO:-}"

echo "=============================================="
echo "S3 vs Notifications DB: Unprocessed Emails"
echo "=============================================="
echo ""

# Load only needed vars from .env (avoid sourcing JSON/complex values that break shell)
if [ -f .env ]; then
  while IFS= read -r line; do
    case "$line" in
      AWS_SES_S3_BUCKET=*) export "$line" ;;
      AWS_SES_S3_OBJECT_KEY_PREFIX=*) export "$line" ;;
      AWS_SES_REGION=*) export "$line" ;;
      AWS_SES_ACCESS_KEY_ID=*) export "$line" ;;
      AWS_SES_SECRET_ACCESS_KEY=*) export "$line" ;;
      DB_HOST=*) export "$line" ;;
      DB_PORT=*) export "$line" ;;
      DB_USER=*) export "$line" ;;
      DB_NAME=*) export "$line" ;;
    esac
  done < <(grep -E '^(AWS_SES_S3_BUCKET|AWS_SES_S3_OBJECT_KEY_PREFIX|AWS_SES_REGION|AWS_SES_ACCESS_KEY_ID|AWS_SES_SECRET_ACCESS_KEY|DB_HOST|DB_PORT|DB_USER|DB_NAME)=' .env 2>/dev/null || true)
  # AWS CLI uses AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
  [ -n "$AWS_SES_ACCESS_KEY_ID" ] && export AWS_ACCESS_KEY_ID="$AWS_SES_ACCESS_KEY_ID"
  [ -n "$AWS_SES_SECRET_ACCESS_KEY" ] && export AWS_SECRET_ACCESS_KEY="$AWS_SES_SECRET_ACCESS_KEY"
fi
S3_BUCKET="${AWS_SES_S3_BUCKET:-speakasap-email-forward}"
S3_PREFIX="${AWS_SES_S3_OBJECT_KEY_PREFIX:-forwards/}"
AWS_REGION="${AWS_SES_REGION:-eu-central-1}"
DB_HOST="${DB_HOST:-db-server-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-dbadmin}"
DB_NAME="${DB_NAME:-notifications}"

echo "S3 bucket: $S3_BUCKET (prefix: $S3_PREFIX)"
echo "DB: $DB_NAME @ $DB_HOST"
echo ""

# 1. List S3 object keys (with size, last modified)
echo "1. Listing S3 objects..."
S3_LIST=$(aws s3api list-objects-v2 \
  --bucket "$S3_BUCKET" \
  --prefix "$S3_PREFIX" \
  --region "$AWS_REGION" \
  --max-items "$S3_MAX_ITEMS" \
  2>/dev/null | python3 -c "
import sys, json
from datetime import datetime, timezone
data = json.load(sys.stdin)
objs = data.get('Contents', [])
for o in objs:
    key = o.get('Key', '')
    size = o.get('Size', 0)
    lm = o.get('LastModified', '')
    print(key + '\t' + str(size) + '\t' + str(lm))
" 2>/dev/null || true)

if [ -z "$S3_LIST" ]; then
  echo -e "${YELLOW}No S3 objects found or AWS CLI failed. Check credentials and bucket.${NC}"
  exit 0
fi

S3_COUNT=$(echo "$S3_LIST" | wc -l | tr -d ' ')
echo -e "${GREEN}Found $S3_COUNT objects in S3${NC}"
echo ""

# 2. Get object keys that are already in DB
echo "2. Querying DB for processed S3 object keys..."
DB_KEYS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "
  SELECT DISTINCT COALESCE(rawData->'receipt'->'action'->>'objectKey', '')
  FROM inbound_emails
  WHERE rawData IS NOT NULL
    AND rawData->'receipt'->'action'->>'objectKey' IS NOT NULL
    AND rawData->'receipt'->'action'->>'objectKey' != '';
" 2>/dev/null || true)

if [ -z "$DB_KEYS" ]; then
  echo -e "${YELLOW}Could not query DB (psql missing or no access). Will treat all S3 as unprocessed.${NC}"
  DB_KEYS=""
fi

# Build a set of processed keys (one per line, grep-friendly)
PROCESSED_COUNT=$(echo "$DB_KEYS" | grep -v '^$' | wc -l | tr -d ' ')
echo -e "${GREEN}Found $PROCESSED_COUNT object keys in DB (processed)${NC}"
echo ""

# 3. Find S3 keys not in DB
echo "3. Finding S3 objects NOT in DB (unprocessed)..."
UNPROCESSED=""
UNPROCESSED_COUNT=0
while IFS= read -r line; do
  key=$(echo "$line" | cut -f1)
  [ -z "$key" ] && continue
  if echo "$DB_KEYS" | grep -Fxq "$key" 2>/dev/null; then
    continue
  fi
  UNPROCESSED="${UNPROCESSED}${line}"$'\n'
  UNPROCESSED_COUNT=$((UNPROCESSED_COUNT + 1))
done <<< "$S3_LIST"

if [ "$UNPROCESSED_COUNT" -eq 0 ]; then
  echo -e "${GREEN}All S3 emails in scope are present in DB. Nothing unprocessed.${NC}"
  echo ""
  echo "If you expect missing emails:"
  echo "  - Increase S3_MAX_ITEMS (default 500)"
  echo "  - Check S3 prefix: $S3_PREFIX"
  exit 0
fi

echo -e "${RED}Found $UNPROCESSED_COUNT S3 object(s) NOT in notifications DB (unprocessed).${NC}"
echo ""

# 4. Show unprocessed with size (likely with attachment if > 150KB)
echo "=============================================="
echo "Unprocessed S3 emails (key, size, last modified)"
echo "=============================================="
printf "KEY\tSIZE_BYTES\tLAST_MODIFIED\n"
echo "$UNPROCESSED" | while IFS= read -r line; do
  [ -z "$line" ] && continue
  key=$(echo "$line" | cut -f1)
  size=$(echo "$line" | cut -f2)
  lm=$(echo "$line" | cut -f3)
  printf "%s\t%s\t%s\n" "$key" "$size" "$lm"
done
echo ""

# 5. Why they are missing
echo "=============================================="
echo "Why these emails were not processed"
echo "=============================================="
echo "Emails in S3 but not in DB usually mean:"
echo "  1. S3 Event Notification is NOT configured for this bucket/prefix"
echo "     → AWS never sends event to SNS → service never receives POST /email/inbound/s3"
echo "  2. SNS subscription for S3 events is missing or not Confirmed"
echo "     → Endpoint must be: https://notifications.statex.cz/email/inbound/s3"
echo "  3. Emails > 150 KB: SES often does NOT send SNS; only S3 receives the file"
echo "     → Without S3 event notification, large emails (with attachments) stay only in S3"
echo ""
echo "Fix: Configure S3 Event Notifications (see docs/S3_EVENT_NOTIFICATIONS_SETUP.md)"
echo ""

# 6. Manual process commands
echo "=============================================="
echo "Manual process (run for each unprocessed key)"
echo "=============================================="
echo "$UNPROCESSED" | while IFS= read -r line; do
  [ -z "$line" ] && continue
  key=$(echo "$line" | cut -f1)
  echo "curl -X POST https://notifications.statex.cz/email/inbound/s3 \\"
  echo "  -H 'Content-Type: application/json' \\"
  echo "  -d '{\"bucket\": \"$S3_BUCKET\", \"key\": \"$key\"}'"
  echo ""
done
echo "Or use script: ts-node scripts/process-s3-email.ts $S3_BUCKET <key>"
echo ""

# 7. Optional: S3 event notification check
echo "=============================================="
echo "S3 Event Notification (quick check)"
echo "=============================================="
NOTIF=$(aws s3api get-bucket-notification-configuration --bucket "$S3_BUCKET" --region "$AWS_REGION" 2>/dev/null || echo "{}")
if echo "$NOTIF" | python3 -c "
import sys, json
d = json.load(sys.stdin)
topic = d.get('TopicConfigurations') or d.get('TopicConfiguration') or []
found = any('s3-email-events' in str(t) or 'inbound' in str(t).lower() for t in topic)
sys.exit(0 if found and topic else 1)
" 2>/dev/null; then
  echo -e "${GREEN}S3 bucket has event notification config (topic/config present).${NC}"
else
  echo -e "${RED}S3 bucket has NO or unknown event notification. Add S3 event → SNS → /email/inbound/s3.${NC}"
fi
echo ""
