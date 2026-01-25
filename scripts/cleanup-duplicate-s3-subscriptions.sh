#!/bin/bash

# Script to help clean up duplicate pending S3 subscriptions
# Note: Pending subscriptions can't be deleted via API until confirmed

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
echo "S3 Subscriptions Status"
echo "=========================================="
echo ""

SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic \
    --topic-arn "${TOPIC_ARN}" \
    --region "${AWS_DEFAULT_REGION}" \
    --output json)

SUB_COUNT=$(echo "$SUBSCRIPTIONS" | jq -r '.Subscriptions | length' 2>/dev/null || echo "0")

echo "Found ${SUB_COUNT} subscription(s) for topic: ${TOPIC_ARN}"
echo ""

if [ "$SUB_COUNT" -eq 0 ]; then
    echo "⚠️  No subscriptions found"
    exit 0
fi

# Display subscriptions
echo "Subscriptions:"
echo "----------------------------------------"
echo "$SUBSCRIPTIONS" | jq -r '.Subscriptions[] | "  Endpoint: \(.Endpoint)\n  Protocol: \(.Protocol)\n  Status: \(if .SubscriptionArn | contains("PendingConfirmation") then "⚠️  Pending Confirmation" else "✅ Confirmed" end)\n  ARN: \(.SubscriptionArn)\n"' 2>/dev/null

echo ""
echo "=========================================="
echo "Important Note"
echo "=========================================="
echo ""
echo "⚠️  Pending subscriptions cannot be deleted via AWS CLI/API."
echo "   They can only be deleted:"
echo "   1. After they are confirmed (then you get full ARN)"
echo "   2. Via AWS Console (if the UI allows it)"
echo "   3. They expire automatically after 3 days if not confirmed"
echo ""

if [ "$SUB_COUNT" -gt 1 ]; then
    echo "You have ${SUB_COUNT} subscriptions (likely duplicates)."
    echo ""
    echo "RECOMMENDED ACTION:"
    echo "1. Wait for one subscription to be confirmed (when AWS sends confirmation request)"
    echo "2. Once confirmed, delete the other pending one(s) via AWS Console"
    echo "3. Or wait for pending ones to expire (3 days)"
    echo ""
    echo "To monitor for confirmation requests:"
    echo "  ssh statex \"docker logs notifications-microservice-blue -f | grep -i 's3\|subscription'\""
    echo ""
fi

echo "=========================================="
echo "Next Steps"
echo "=========================================="
echo ""
echo "1. Monitor service logs for confirmation requests:"
echo "   ssh statex \"docker logs notifications-microservice-blue -f | grep -i 'Processing request to /email/inbound/s3'\""
echo ""
echo "2. Check AWS Console for subscription status:"
echo "   https://eu-central-1.console.aws.amazon.com/sns/v3/home?region=eu-central-1#/topic/${TOPIC_ARN}"
echo ""
echo "3. Once a subscription is confirmed, you can delete pending ones via:"
echo "   - AWS Console (recommended)"
echo "   - AWS CLI: aws sns unsubscribe --subscription-arn '<FULL_ARN>' --region ${AWS_DEFAULT_REGION}"
echo ""
