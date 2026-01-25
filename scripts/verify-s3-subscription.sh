#!/bin/bash

# Script to verify and manually confirm S3 event notifications subscription

set -e

echo "=========================================="
echo "S3 Event Notifications Subscription Verification"
echo "=========================================="
echo ""

SNS_TOPIC_ARN="arn:aws:sns:eu-central-1:781206275849:s3-email-events"
WEBHOOK_ENDPOINT="https://notifications.statex.cz/email/inbound/s3"
AWS_REGION="eu-central-1"

echo "Configuration:"
echo "  SNS Topic: ${SNS_TOPIC_ARN}"
echo "  Webhook: ${WEBHOOK_ENDPOINT}"
echo "  Region: ${AWS_REGION}"
echo ""

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo "⚠️  AWS CLI not installed"
    echo ""
    echo "Manual verification steps:"
    echo "1. Go to: https://${AWS_REGION}.console.aws.amazon.com/sns/v3/home?region=${AWS_REGION}#/topic/${SNS_TOPIC_ARN}"
    echo "2. Click on 'Subscriptions' tab"
    echo "3. Find subscription for: ${WEBHOOK_ENDPOINT}"
    echo "4. Check status:"
    echo "   - If 'Pending confirmation':"
    echo "     a. Click on the subscription"
    echo "     b. Copy the 'SubscribeURL' from the details"
    echo "     c. Open it in a browser or use curl to confirm"
    echo "   - If 'Confirmed': ✅ Subscription is active"
    echo ""
    echo "To manually confirm (if pending):"
    echo "  curl -X GET '<SubscribeURL>'"
    echo ""
    exit 0
fi

echo "Checking SNS subscriptions..."
echo "----------------------------------------"

# List subscriptions for the topic
SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --region "${AWS_REGION}" \
    --output json 2>/dev/null || echo "[]")

if [ "$SUBSCRIPTIONS" = "[]" ]; then
    echo "❌ No subscriptions found for topic"
    echo ""
    echo "Please create subscription:"
    echo "1. Go to: https://${AWS_REGION}.console.aws.amazon.com/sns/v3/home?region=${AWS_REGION}#/topic/${SNS_TOPIC_ARN}"
    echo "2. Click 'Create subscription'"
    echo "3. Configure:"
    echo "   - Protocol: HTTPS"
    echo "   - Endpoint: ${WEBHOOK_ENDPOINT}"
    echo "   - Enable raw message delivery: Yes"
    exit 1
fi

# Check if our endpoint is subscribed
ENDPOINT_SUB=$(echo "$SUBSCRIPTIONS" | jq -r ".Subscriptions[] | select(.Endpoint == \"${WEBHOOK_ENDPOINT}\")" 2>/dev/null || echo "")

if [ -z "$ENDPOINT_SUB" ]; then
    echo "⚠️  Subscription not found for endpoint: ${WEBHOOK_ENDPOINT}"
    echo ""
    echo "Found subscriptions:"
    echo "$SUBSCRIPTIONS" | jq -r '.Subscriptions[] | "  - \(.Endpoint) [\(.SubscriptionArn)]"' 2>/dev/null || echo "$SUBSCRIPTIONS"
    exit 1
fi

SUB_ARN=$(echo "$ENDPOINT_SUB" | jq -r '.SubscriptionArn')
SUB_STATUS=$(echo "$ENDPOINT_SUB" | jq -r '.SubscriptionArn' | grep -q "PendingConfirmation" && echo "PendingConfirmation" || echo "Confirmed")

echo "✅ Subscription found:"
echo "   ARN: ${SUB_ARN}"
echo "   Status: ${SUB_STATUS}"
echo ""

if [ "$SUB_STATUS" = "PendingConfirmation" ]; then
    echo "⚠️  Subscription is pending confirmation"
    echo ""
    echo "The service should auto-confirm when AWS sends the confirmation request."
    echo "If it's still pending, you can:"
    echo ""
    echo "1. Wait for AWS to retry (it retries periodically)"
    echo "2. Manually confirm using SubscribeURL from AWS Console"
    echo "3. Check service logs for confirmation attempts:"
    echo "   docker logs notifications-microservice-blue | grep -i 's3.*subscription\|/email/inbound/s3'"
    echo ""
    echo "To get SubscribeURL:"
    echo "1. Go to: https://${AWS_REGION}.console.aws.amazon.com/sns/v3/home?region=${AWS_REGION}#/subscriptions"
    echo "2. Find subscription ARN: ${SUB_ARN}"
    echo "3. Click on it to see details and SubscribeURL"
    echo ""
    echo "Then confirm manually:"
    echo "  curl -X GET '<SubscribeURL>'"
    exit 1
else
    echo "✅ Subscription is confirmed and active!"
    echo ""
    echo "Testing endpoint..."
    TEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${WEBHOOK_ENDPOINT}" \
        -H "Content-Type: application/json" \
        -d '{"test": "ping"}' 2>/dev/null || echo "000")
    
    if [ "$TEST_RESPONSE" = "200" ] || [ "$TEST_RESPONSE" = "400" ] || [ "$TEST_RESPONSE" = "404" ]; then
        echo "✅ Endpoint is accessible (HTTP ${TEST_RESPONSE})"
    else
        echo "⚠️  Endpoint returned HTTP ${TEST_RESPONSE} (may indicate connectivity issue)"
    fi
fi

echo ""
echo "=========================================="
echo "Verification complete"
echo "=========================================="
