#!/bin/bash

# Script to get SubscribeURL from AWS SNS subscription
# Usage: ./get-subscription-url.sh <subscription-arn>

set -e

SUBSCRIPTION_ARN="${1:-arn:aws:sns:eu-central-1:781206275849:s3-email-events:fc776e48-1515-450b-9513-1e90b83e39f3}"

echo "Getting subscription details for: ${SUBSCRIPTION_ARN}"
echo ""

if ! command -v aws &> /dev/null; then
    echo "⚠️  AWS CLI not installed"
    echo ""
    echo "To get SubscribeURL manually:"
    echo "1. Go to: https://eu-central-1.console.aws.amazon.com/sns/v3/home?region=eu-central-1#/subscriptions"
    echo "2. Find subscription: ${SUBSCRIPTION_ARN}"
    echo "3. Click on it to see details"
    echo "4. Look for 'SubscribeURL' or 'Confirmation token'"
    echo ""
    echo "Or use AWS CLI:"
    echo "  aws sns get-subscription-attributes --subscription-arn '${SUBSCRIPTION_ARN}' --region eu-central-1"
    exit 1
fi

echo "Fetching subscription attributes..."
ATTRIBUTES=$(aws sns get-subscription-attributes \
    --subscription-arn "${SUBSCRIPTION_ARN}" \
    --region eu-central-1 \
    --output json 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Failed to get subscription attributes"
    exit 1
fi

echo "Subscription attributes:"
echo "$ATTRIBUTES" | jq '.'
echo ""

# Extract confirmation token if available
TOKEN=$(echo "$ATTRIBUTES" | jq -r '.Attributes.ConfirmationWasAuthenticated // empty' 2>/dev/null)
STATUS=$(echo "$ATTRIBUTES" | jq -r '.Attributes.SubscriptionArn' | grep -q "PendingConfirmation" && echo "PendingConfirmation" || echo "Confirmed")

if [ "$STATUS" = "PendingConfirmation" ]; then
    echo "⚠️  Subscription is still pending confirmation"
    echo ""
    echo "The SubscribeURL is typically sent in the confirmation request body."
    echo "Check service logs for the SubscribeURL:"
    echo "  docker logs notifications-microservice-blue | grep -i 'SubscribeURL'"
    echo ""
    echo "Or check if AWS sent the confirmation request:"
    echo "  docker logs notifications-microservice-blue --since 10m | grep -i 's3.*subscription\|/email/inbound/s3'"
    echo ""
    echo "If the service received it, it should have logged the SubscribeURL."
    echo "You can then confirm manually:"
    echo "  curl -X GET '<SubscribeURL>'"
else
    echo "✅ Subscription is confirmed!"
fi
