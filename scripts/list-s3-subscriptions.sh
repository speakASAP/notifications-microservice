#!/bin/bash

# Script to list S3 event subscriptions using AWS CLI
# Uses credentials from .env file

set -e

export PATH="$HOME/.local/bin:$PATH"

echo "=========================================="
echo "List S3 Event Subscriptions"
echo "=========================================="
echo ""

cd "$(dirname "$0")/.." || exit 1

# Load AWS credentials from .env
if [ -f .env ]; then
    echo "Loading AWS credentials from .env..."
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

echo "Topic ARN: ${TOPIC_ARN}"
echo "Webhook: ${WEBHOOK_ENDPOINT}"
echo ""

echo "Listing subscriptions..."
echo "----------------------------------------"

SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic \
    --topic-arn "${TOPIC_ARN}" \
    --region "${AWS_DEFAULT_REGION}" \
    --output json 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Failed to list subscriptions. Check AWS credentials."
    exit 1
fi

SUB_COUNT=$(echo "$SUBSCRIPTIONS" | jq -r '.Subscriptions | length' 2>/dev/null || echo "0")

if [ "$SUB_COUNT" -eq 0 ]; then
    echo "⚠️  No subscriptions found for this topic"
    echo ""
    echo "Create subscription:"
    echo "  aws sns subscribe --topic-arn '${TOPIC_ARN}' --protocol https --notification-endpoint '${WEBHOOK_ENDPOINT}' --attributes '{\"RawMessageDelivery\":\"true\"}' --region ${AWS_DEFAULT_REGION}"
else
    echo "Found ${SUB_COUNT} subscription(s):"
    echo ""
    echo "$SUBSCRIPTIONS" | jq -r '.Subscriptions[] | "  ARN: \(.SubscriptionArn)\n  Endpoint: \(.Endpoint)\n  Protocol: \(.Protocol)\n  Status: \(if .SubscriptionArn | contains("PendingConfirmation") then "Pending confirmation" else "Confirmed" end)\n"' 2>/dev/null || echo "$SUBSCRIPTIONS"
    
    echo ""
    echo "To delete a subscription:"
    echo "  aws sns unsubscribe --subscription-arn '<SUBSCRIPTION_ARN>' --region ${AWS_DEFAULT_REGION}"
fi

echo ""
