#!/bin/bash

# Script to manage S3 event subscriptions using AWS CLI

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
echo "S3 Event Subscriptions Management"
echo "=========================================="
echo ""

echo "Listing all subscriptions for topic: ${TOPIC_ARN}"
echo "----------------------------------------"

SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic \
    --topic-arn "${TOPIC_ARN}" \
    --region "${AWS_DEFAULT_REGION}" \
    --output json)

SUB_COUNT=$(echo "$SUBSCRIPTIONS" | jq -r '.Subscriptions | length' 2>/dev/null || echo "0")

if [ "$SUB_COUNT" -eq 0 ]; then
    echo "⚠️  No subscriptions found"
    exit 0
fi

echo "Found ${SUB_COUNT} subscription(s):"
echo ""

# Display subscriptions
echo "$SUBSCRIPTIONS" | jq -r '.Subscriptions[] | "  Subscription ARN: \(.SubscriptionArn)\n  Endpoint: \(.Endpoint)\n  Protocol: \(.Protocol)\n  Status: \(if .SubscriptionArn | contains("PendingConfirmation") then "⚠️  Pending Confirmation" else "✅ Confirmed" end)\n"' 2>/dev/null

echo ""
echo "=========================================="
echo "Actions"
echo "=========================================="
echo ""

# Check for pending subscriptions
PENDING_SUBS=$(echo "$SUBSCRIPTIONS" | jq -r '.Subscriptions[] | select(.SubscriptionArn | contains("PendingConfirmation")) | .SubscriptionArn' 2>/dev/null || echo "")

if [ -n "$PENDING_SUBS" ]; then
    echo "⚠️  Found pending subscription(s):"
    echo "$PENDING_SUBS" | while read -r sub_arn; do
        echo "  - ${sub_arn}"
    done
    echo ""
    echo "The service should auto-confirm when AWS sends the confirmation request."
    echo "Monitor logs: docker logs notifications-microservice-blue -f | grep -i 's3\|subscription'"
    echo ""
fi

# Check for multiple subscriptions
if [ "$SUB_COUNT" -gt 1 ]; then
    echo "⚠️  Multiple subscriptions found. You may want to delete old ones."
    echo ""
    echo "To delete a subscription:"
    echo "  aws sns unsubscribe --subscription-arn '<SUBSCRIPTION_ARN>' --region ${AWS_DEFAULT_REGION}"
    echo ""
fi

echo "To get subscription details (including SubscribeURL if pending):"
echo "  aws sns get-subscription-attributes --subscription-arn '<SUBSCRIPTION_ARN>' --region ${AWS_DEFAULT_REGION}"
echo ""
