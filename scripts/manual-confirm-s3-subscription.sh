#!/bin/bash

# Script to manually confirm S3 event notifications subscription
# This script helps if the SubscribeURL is not visible in AWS Console

set -e

SUBSCRIPTION_ARN="arn:aws:sns:eu-central-1:781206275849:s3-email-events:fc776e48-1515-450b-9513-1e90b83e39f3"
WEBHOOK_ENDPOINT="https://notifications.statex.cz/email/inbound/s3"
TOPIC_ARN="arn:aws:sns:eu-central-1:781206275849:s3-email-events"

echo "=========================================="
echo "Manual S3 Subscription Confirmation Helper"
echo "=========================================="
echo ""
echo "Subscription ARN: ${SUBSCRIPTION_ARN}"
echo "Webhook Endpoint: ${WEBHOOK_ENDPOINT}"
echo ""

echo "Since the SubscribeURL is not visible in AWS Console, try these options:"
echo ""
echo "OPTION 1: Check if service received the confirmation request"
echo "----------------------------------------"
echo "The service should have received a POST request with SubscribeURL."
echo "Check logs:"
echo "  ssh statex \"docker logs notifications-microservice-blue --since 1h | grep -i 'SubscribeURL\|SubscriptionConfirmation.*s3'\""
echo ""

echo "OPTION 2: Delete and recreate subscription"
echo "----------------------------------------"
echo "If the confirmation request was lost, you can:"
echo "1. Delete the pending subscription in AWS Console"
echo "2. Recreate it - AWS will send a new confirmation request"
echo "3. The service will auto-confirm it"
echo ""

echo "OPTION 3: Wait for AWS retry"
echo "----------------------------------------"
echo "AWS SNS retries confirmation requests periodically."
echo "Wait a few minutes and check if the subscription becomes confirmed."
echo ""

echo "OPTION 4: Use AWS CLI to get subscription details"
echo "----------------------------------------"
if command -v aws &> /dev/null; then
    echo "Checking subscription status..."
    STATUS=$(aws sns get-subscription-attributes \
        --subscription-arn "${SUBSCRIPTION_ARN}" \
        --region eu-central-1 \
        --query 'Attributes.[SubscriptionArn,Owner]' \
        --output text 2>/dev/null || echo "ERROR")
    
    if [ "$STATUS" != "ERROR" ]; then
        echo "✅ Subscription exists"
        echo "Status: $STATUS"
    else
        echo "❌ Could not get subscription details"
    fi
else
    echo "AWS CLI not installed - cannot check subscription status"
fi

echo ""
echo "To check subscription status in AWS Console:"
echo "  https://eu-central-1.console.aws.amazon.com/sns/v3/home?region=eu-central-1#/subscriptions"
echo ""
