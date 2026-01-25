#!/bin/bash

# Script to force S3 subscription confirmation by deleting and recreating
# Since AWS hasn't sent confirmation after 155 minutes, we'll recreate it

set -e

SUBSCRIPTION_ARN="arn:aws:sns:eu-central-1:781206275849:s3-email-events:fc776e48-1515-450b-9513-1e90b83e39f3"
TOPIC_ARN="arn:aws:sns:eu-central-1:781206275849:s3-email-events"
WEBHOOK_ENDPOINT="https://notifications.statex.cz/email/inbound/s3"

echo "=========================================="
echo "Force S3 Subscription Confirmation"
echo "=========================================="
echo ""
echo "Since AWS hasn't sent confirmation after 155 minutes,"
echo "we need to delete and recreate the subscription."
echo ""
echo "Subscription ARN: ${SUBSCRIPTION_ARN}"
echo "Topic ARN: ${TOPIC_ARN}"
echo "Webhook: ${WEBHOOK_ENDPOINT}"
echo ""

if ! command -v aws &> /dev/null; then
    echo "⚠️  AWS CLI not installed"
    echo ""
    echo "MANUAL STEPS (recommended):"
    echo "1. Go to: https://eu-central-1.console.aws.amazon.com/sns/v3/home?region=eu-central-1#/topic/${TOPIC_ARN}"
    echo "2. Click 'Subscriptions' tab"
    echo "3. Find subscription: ${WEBHOOK_ENDPOINT}"
    echo "4. Click 'Delete' (or the trash icon)"
    echo "5. Click 'Create subscription'"
    echo "6. Configure:"
    echo "   - Protocol: HTTPS"
    echo "   - Endpoint: ${WEBHOOK_ENDPOINT}"
    echo "   - Enable raw message delivery: ✅ YES"
    echo "7. Click 'Create subscription'"
    echo "8. AWS will send a NEW confirmation request"
    echo "9. The service should auto-confirm it within seconds"
    echo ""
    echo "Then monitor logs:"
    echo "  ssh statex \"docker logs notifications-microservice-blue -f | grep -i 's3\|subscription'\""
    exit 0
fi

echo "Checking current subscription status..."
STATUS=$(aws sns get-subscription-attributes \
    --subscription-arn "${SUBSCRIPTION_ARN}" \
    --region eu-central-1 \
    --query 'Attributes.[SubscriptionArn]' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STATUS" = "NOT_FOUND" ]; then
    echo "❌ Subscription not found. It may have been deleted."
    echo "Creating new subscription..."
else
    echo "Current subscription status: ${STATUS}"
    echo ""
    read -p "Delete existing subscription and create new one? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
    
    echo "Deleting subscription..."
    aws sns unsubscribe \
        --subscription-arn "${SUBSCRIPTION_ARN}" \
        --region eu-central-1
    echo "✅ Subscription deleted"
    sleep 2
fi

echo "Creating new subscription..."
NEW_SUB_ARN=$(aws sns subscribe \
    --topic-arn "${TOPIC_ARN}" \
    --protocol https \
    --notification-endpoint "${WEBHOOK_ENDPOINT}" \
    --attributes '{"RawMessageDelivery":"true"}' \
    --region eu-central-1 \
    --query 'SubscriptionArn' \
    --output text)

echo "✅ New subscription created: ${NEW_SUB_ARN}"
echo ""
echo "AWS will send a confirmation request to: ${WEBHOOK_ENDPOINT}"
echo "The service should auto-confirm it."
echo ""
echo "Monitor logs:"
echo "  ssh statex \"docker logs notifications-microservice-blue -f | grep -i 's3\|subscription'\""
echo ""
echo "Or check status in AWS Console:"
echo "  https://eu-central-1.console.aws.amazon.com/sns/v3/home?region=eu-central-1#/subscriptions"
