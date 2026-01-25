#!/bin/bash

# Script to delete all pending S3 subscriptions and keep only confirmed ones

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
echo "Delete Pending S3 Subscriptions"
echo "=========================================="
echo ""

echo "Finding all subscriptions for topic: ${TOPIC_ARN}"
echo "----------------------------------------"

SUBSCRIPTIONS=$(aws sns list-subscriptions \
    --region "${AWS_DEFAULT_REGION}" \
    --output json)

# Filter subscriptions for our topic
TOPIC_SUBS=$(echo "$SUBSCRIPTIONS" | jq -r ".Subscriptions[] | select(.TopicArn == \"${TOPIC_ARN}\")")

SUB_COUNT=$(echo "$TOPIC_SUBS" | jq -s 'length')

if [ "$SUB_COUNT" -eq 0 ]; then
    echo "⚠️  No subscriptions found for this topic"
    exit 0
fi

echo "Found ${SUB_COUNT} subscription(s):"
echo ""

# Display all subscriptions
echo "$TOPIC_SUBS" | jq -r '"  \(.SubscriptionArn) | \(.Endpoint) | \(if .SubscriptionArn | contains("PendingConfirmation") then "⚠️  Pending" else "✅ Confirmed" end)"' | while IFS='|' read -r arn endpoint status; do
    echo "  ARN: ${arn}"
    echo "  Endpoint: ${endpoint}"
    echo "  Status: ${status}"
    echo ""
done

# Find pending subscriptions
PENDING_ARNS=$(echo "$TOPIC_SUBS" | jq -r 'select(.SubscriptionArn | contains("PendingConfirmation")) | .SubscriptionArn' || echo "")

if [ -z "$PENDING_ARNS" ]; then
    echo "✅ No pending subscriptions found. All are confirmed."
    exit 0
fi

echo "=========================================="
echo "Pending Subscriptions to Delete"
echo "=========================================="
echo ""

PENDING_COUNT=$(echo "$PENDING_ARNS" | grep -c . || echo "0")
echo "Found ${PENDING_COUNT} pending subscription(s):"
echo ""

echo "$PENDING_ARNS" | while read -r sub_arn; do
    if [ -n "$sub_arn" ]; then
        echo "  - ${sub_arn}"
    fi
done

echo ""
read -p "Delete all pending subscriptions? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Deleting pending subscriptions..."
echo "----------------------------------------"

DELETED=0
FAILED=0

echo "$PENDING_ARNS" | while read -r sub_arn; do
    if [ -n "$sub_arn" ]; then
        echo "Deleting: ${sub_arn}..."
        if aws sns unsubscribe \
            --subscription-arn "${sub_arn}" \
            --region "${AWS_DEFAULT_REGION}" 2>/dev/null; then
            echo "  ✅ Deleted successfully"
            DELETED=$((DELETED + 1))
        else
            echo "  ❌ Failed to delete"
            FAILED=$((FAILED + 1))
        fi
        echo ""
    fi
done

echo "=========================================="
echo "Summary"
echo "=========================================="
echo "Deleted: ${DELETED}"
echo "Failed: ${FAILED}"
echo ""

if [ "$DELETED" -gt 0 ]; then
    echo "✅ Pending subscriptions deleted."
    echo ""
    echo "Now create a NEW subscription in AWS Console:"
    echo "1. Go to: https://eu-central-1.console.aws.amazon.com/sns/v3/home?region=eu-central-1#/topic/${TOPIC_ARN}"
    echo "2. Click 'Create subscription'"
    echo "3. Configure:"
    echo "   - Protocol: HTTPS"
    echo "   - Endpoint: ${WEBHOOK_ENDPOINT}"
    echo "   - Enable raw message delivery: ✅ YES"
    echo "4. Click 'Create subscription'"
    echo ""
    echo "AWS will send a new confirmation request immediately."
fi
