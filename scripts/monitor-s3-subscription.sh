#!/bin/bash

# Script to monitor S3 subscription confirmation status

set -e

export PATH="$HOME/.local/bin:$PATH"

cd "$(dirname "$0")/.." || exit 1

# Load AWS credentials from .env
if [ -f .env ]; then
    export $(grep -E '^AWS_SES_ACCESS_KEY_ID=|^AWS_SES_SECRET_ACCESS_KEY=|^AWS_SES_REGION=' .env | xargs)
    export AWS_ACCESS_KEY_ID="${AWS_SES_ACCESS_KEY_ID}"
    export AWS_SECRET_ACCESS_KEY="${AWS_SES_SECRET_ACCESS_KEY}"
    export AWS_DEFAULT_REGION="${AWS_SES_REGION:-eu-central-1}"
else
    echo "⚠️  .env file not found"
    exit 1
fi

TOPIC_ARN="arn:aws:sns:eu-central-1:781206275849:s3-email-events"
WEBHOOK_ENDPOINT="https://notifications.statex.cz/email/inbound/s3"

echo "=========================================="
echo "S3 Subscription Status Monitor"
echo "=========================================="
echo ""

echo "Checking subscriptions..."
SUBSCRIPTIONS=$(aws sns list-subscriptions \
    --region "${AWS_DEFAULT_REGION}" \
    --output json)

S3_SUBS=$(echo "$SUBSCRIPTIONS" | jq -r "[.Subscriptions[] | select(.TopicArn == \"${TOPIC_ARN}\")]")

SUB_COUNT=$(echo "$S3_SUBS" | jq -r 'length')

echo "Found ${SUB_COUNT} subscription(s) for s3-email-events topic:"
echo ""

if [ "$SUB_COUNT" -eq 0 ]; then
    echo "⚠️  No subscriptions found"
    exit 0
fi

# Display subscriptions
echo "$S3_SUBS" | jq -r '.[] | "  Endpoint: \(.Endpoint)\n  Status: \(if .SubscriptionArn | contains("PendingConfirmation") then "⚠️  Pending Confirmation" else "✅ Confirmed" end)\n  ARN: \(.SubscriptionArn)\n"' 2>/dev/null

echo ""
echo "=========================================="
echo "Service Logs Check"
echo "=========================================="
echo ""

echo "Checking if service received any confirmation requests..."
RECENT_REQUESTS=$(docker logs notifications-microservice-blue --since 1h 2>&1 | grep -iE 'Processing request to /email/inbound/s3|SubscriptionConfirmation.*s3' | wc -l || echo "0")

if [ "$RECENT_REQUESTS" -eq "0" ]; then
    echo "⚠️  No confirmation requests received in the last hour"
    echo ""
    echo "This suggests AWS SNS cannot reach your endpoint."
    echo "Possible reasons:"
    echo "  - Network/firewall blocking AWS IPs"
    echo "  - SSL certificate issues"
    echo "  - Endpoint not publicly accessible"
    echo ""
    echo "Testing endpoint accessibility..."
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${WEBHOOK_ENDPOINT}" -H 'Content-Type: application/json' -d '{"test":"ping"}' 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
        echo "✅ Endpoint is accessible (HTTP ${HTTP_CODE})"
        echo "   But AWS SNS may not be able to reach it."
        echo "   Check firewall rules and ensure AWS SNS IP ranges are allowed."
    else
        echo "⚠️  Endpoint returned HTTP ${HTTP_CODE}"
    fi
else
    echo "✅ Found ${RECENT_REQUESTS} request(s) in logs"
    echo "   Check logs: docker logs notifications-microservice-blue --since 1h | grep -i 's3\|subscription'"
fi

echo ""
echo "=========================================="
echo "Recommendations"
echo "=========================================="
echo ""

if [ "$SUB_COUNT" -gt 1 ]; then
    echo "⚠️  Multiple subscriptions found (${SUB_COUNT})"
    echo "   Once one is confirmed, delete the others via AWS Console"
    echo ""
fi

if echo "$S3_SUBS" | jq -r '.[] | .SubscriptionArn' | grep -q "PendingConfirmation"; then
    echo "Pending subscriptions detected."
    echo ""
    echo "AWS SNS should send confirmation requests periodically."
    echo "If no requests are received after 24 hours, check:"
    echo "  1. Endpoint is publicly accessible"
    echo "  2. SSL certificate is valid"
    echo "  3. Firewall allows AWS SNS IP ranges"
    echo "  4. Endpoint returns 200/201 status codes"
    echo ""
    echo "Monitor in real-time:"
    echo "  docker logs notifications-microservice-blue -f | grep -i 's3\|subscription'"
fi

echo ""
