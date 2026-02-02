#!/bin/bash

# Trace Email with Attachments
# This script helps trace why emails with attachments don't reach helpdesk

set -e

echo "=========================================="
echo "Tracing Email with Attachments"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get email details from user or use defaults
EMAIL_TO="${1:-contact@speakasap.com}"
MESSAGE_ID="${2:-}"
TIMESTAMP="${3:-}"

echo "Searching for email to: ${EMAIL_TO}"
if [ -n "$MESSAGE_ID" ]; then
    echo "Message ID: ${MESSAGE_ID}"
fi
if [ -n "$TIMESTAMP" ]; then
    echo "Timestamp: ${TIMESTAMP}"
fi
echo ""

# 1. Check database
echo "1. Checking Database..."
echo "----------------------"
if command -v psql &> /dev/null && [ -f .env ]; then
    source .env
    DB_HOST="${DB_HOST:-db-server-postgres}"
    DB_PORT="${DB_PORT:-5432}"
    DB_USER="${DB_USER:-dbadmin}"
    DB_NAME="${DB_NAME:-notifications}"

    if [ -n "$MESSAGE_ID" ]; then
        QUERY="SELECT id, \"from\", \"to\", subject, \"receivedAt\", status, 
               CASE WHEN attachments IS NULL THEN 0 ELSE jsonb_array_length(attachments) END as attachments_count
               FROM inbound_emails 
               WHERE \"rawData\"->>'mail'->>'messageId' = '${MESSAGE_ID}' 
               OR \"to\" = '${EMAIL_TO}'
               ORDER BY \"receivedAt\" DESC LIMIT 5;"
    else
        QUERY="SELECT id, \"from\", \"to\", subject, \"receivedAt\", status,
               CASE WHEN attachments IS NULL THEN 0 ELSE jsonb_array_length(attachments) END as attachments_count
               FROM inbound_emails 
               WHERE \"to\" = '${EMAIL_TO}'
               ORDER BY \"receivedAt\" DESC LIMIT 5;"
    fi

    RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "$QUERY" 2>/dev/null || echo "")

    if [ -n "$RESULT" ] && [ "$RESULT" != "" ]; then
        echo -e "${GREEN}✓ Found in database:${NC}"
        echo "$RESULT" | while IFS='|' read -r id from to subject received_at status attachments_count; do
            echo "  ID: $(echo $id | xargs)"
            echo "  From: $(echo $from | xargs)"
            echo "  To: $(echo $to | xargs)"
            echo "  Subject: $(echo $subject | xargs)"
            echo "  Received: $(echo $received_at | xargs)"
            echo "  Status: $(echo $status | xargs)"
            echo "  Attachments: $(echo $attachments_count | xargs)"
            echo ""
        done
    else
        echo -e "${RED}✗ Not found in database${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Cannot check database (psql not available or .env missing)${NC}"
fi
echo ""

# 2. Check S3 bucket
echo "2. Checking S3 Bucket..."
echo "------------------------"
if command -v aws &> /dev/null && [ -f .env ]; then
    source .env
    S3_BUCKET="${AWS_SES_S3_BUCKET:-speakasap-email-forward}"
    S3_PREFIX="${AWS_SES_S3_OBJECT_KEY_PREFIX:-forwards/}"
    AWS_REGION="${AWS_SES_REGION:-eu-central-1}"

    echo "Checking S3 bucket: $S3_BUCKET (prefix: $S3_PREFIX)"

    # List recent objects
    RECENT_OBJECTS=$(aws s3api list-objects-v2 \
        --bucket "$S3_BUCKET" \
        --prefix "$S3_PREFIX" \
        --region "$AWS_REGION" \
        --max-items 50 \
        2>/dev/null | python3 -c "
import sys, json
from datetime import datetime, timezone
data = json.load(sys.stdin)
objs = data.get('Contents', [])
recent = [o for o in objs if o.get('LastModified', '')]
recent.sort(key=lambda x: x.get('LastModified', ''), reverse=True)
for o in recent[:10]:
    print(f\"{o.get('LastModified', 'N/A')} - {o.get('Key', 'N/A')} - {o.get('Size', 0)} bytes\")
" 2>/dev/null || echo "")

    if [ -n "$RECENT_OBJECTS" ]; then
        echo -e "${GREEN}✓ Recent emails in S3:${NC}"
        echo "$RECENT_OBJECTS"
    else
        echo -e "${YELLOW}⚠ No recent emails found in S3${NC}"
        echo "  → Check if AWS credentials have S3 read permissions"
        echo "  → Check if bucket name is correct: $S3_BUCKET"
    fi
else
    echo -e "${YELLOW}⚠ AWS CLI not available or .env missing${NC}"
fi
echo ""

# 3. Check service logs
echo "3. Checking Service Logs..."
echo "---------------------------"
if docker ps | grep -q notifications-microservice; then
    CONTAINER_NAME=$(docker ps | grep notifications-microservice | awk '{print $NF}' | head -1)
    echo "Checking logs from container: $CONTAINER_NAME"

    if [ -n "$MESSAGE_ID" ]; then
        LOGS=$(docker logs "$CONTAINER_NAME" --since '1 hour ago' 2>&1 | grep -i "$MESSAGE_ID" | head -20 || echo "")
    else
        LOGS=$(docker logs "$CONTAINER_NAME" --since '1 hour ago' 2>&1 | grep -iE "$EMAIL_TO|attachment|S3|multipart/mixed" | head -30 || echo "")
    fi

    if [ -n "$LOGS" ]; then
        echo -e "${GREEN}✓ Found in logs:${NC}"
        echo "$LOGS"
    else
        echo -e "${YELLOW}⚠ No relevant logs found${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Container not found${NC}"
fi
echo ""

# 4. Check S3 event notifications
echo "4. Checking S3 Event Notifications..."
echo "--------------------------------------"
if command -v aws &> /dev/null && [ -f .env ]; then
    source .env
    S3_BUCKET="${AWS_SES_S3_BUCKET:-speakasap-email-forward}"
    AWS_REGION="${AWS_SES_REGION:-eu-central-1}"

    NOTIFICATION_CONFIG=$(aws s3api get-bucket-notification-configuration \
        --bucket "$S3_BUCKET" \
        --region "$AWS_REGION" \
        2>/dev/null || echo "")

    if [ -n "$NOTIFICATION_CONFIG" ]; then
        echo -e "${GREEN}✓ S3 event notifications configured:${NC}"
        echo "$NOTIFICATION_CONFIG" | python3 -m json.tool 2>/dev/null | head -30 || echo "$NOTIFICATION_CONFIG"
    else
        echo -e "${RED}✗ S3 event notifications NOT configured${NC}"
        echo "  → This is why emails with attachments (>150KB) are not processed automatically"
        echo "  → See: notifications-microservice/docs/S3_EVENT_NOTIFICATIONS_SETUP.md"
    fi
else
    echo -e "${YELLOW}⚠ AWS CLI not available${NC}"
fi
echo ""

# 5. Summary and recommendations
echo "=========================================="
echo "Summary and Recommendations"
echo "=========================================="
echo ""

if [ -z "$MESSAGE_ID" ]; then
    echo "To trace a specific email, provide message ID:"
    echo "  ./trace-email-with-attachments.sh contact@speakasap.com <message-id>"
    echo ""
fi

echo "If email is in S3 but not in database:"
echo "  1. Check S3 event notifications are configured"
echo "  2. Check SNS subscription for S3 events is confirmed"
echo "  3. Manually process from S3:"
echo "     curl -X POST https://notifications.statex.cz/email/inbound/s3 \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"bucket\": \"speakasap-email-forward\", \"key\": \"forwards/<object-key>\"}'"
echo ""
echo "If email is NOT in S3:"
echo "  1. Check AWS SES receiving rule has S3 action configured"
echo "  2. Check S3 bucket permissions allow SES to write"
echo "  3. Check if email was actually received by AWS SES"
echo "  4. Check AWS SES console for bounce/complaint notifications"
echo ""
