#!/bin/bash

# Script to guide S3 Event Notifications setup
# This script provides step-by-step instructions and verification

set -e

echo "=========================================="
echo "S3 Event Notifications Setup Guide"
echo "=========================================="
echo ""

# Configuration
S3_BUCKET="speakasap-email-forward"
S3_PREFIX="forwards/"
SNS_TOPIC_NAME="s3-email-events"
WEBHOOK_ENDPOINT="https://notifications.statex.cz/email/inbound/s3"
AWS_REGION="eu-central-1"

echo "Configuration:"
echo "  S3 Bucket: ${S3_BUCKET}"
echo "  S3 Prefix: ${S3_PREFIX}"
echo "  SNS Topic: ${SNS_TOPIC_NAME}"
echo "  Webhook: ${WEBHOOK_ENDPOINT}"
echo "  Region: ${AWS_REGION}"
echo ""

echo "=========================================="
echo "STEP 1: Create SNS Topic for S3 Events"
echo "=========================================="
echo ""
echo "1. Go to AWS SNS Console:"
echo "   https://${AWS_REGION}.console.aws.amazon.com/sns/v3/home?region=${AWS_REGION}#/topics"
echo ""
echo "2. Click 'Create topic'"
echo ""
echo "3. Configure:"
echo "   - Type: Standard"
echo "   - Name: ${SNS_TOPIC_NAME}"
echo "   - Display name: (leave empty or optional)"
echo ""
echo "4. Click 'Create topic'"
echo ""
echo "5. Note the Topic ARN (e.g., arn:aws:sns:${AWS_REGION}:ACCOUNT_ID:${SNS_TOPIC_NAME})"
echo ""
read -p "Press Enter when topic is created..."

echo ""
echo "=========================================="
echo "STEP 2: Configure S3 Bucket Event Notifications"
echo "=========================================="
echo ""
echo "1. Go to S3 Console:"
echo "   https://${AWS_REGION}.console.aws.amazon.com/s3/buckets/${S3_BUCKET}?region=${AWS_REGION}&tab=properties"
echo ""
echo "2. Click on 'Properties' tab"
echo ""
echo "3. Scroll down to 'Event notifications' section"
echo ""
echo "4. Click 'Create event notification'"
echo ""
echo "5. Configure:"
echo "   - Event name: ProcessInboundEmails"
echo "   - Prefix: ${S3_PREFIX}"
echo "   - Suffix: (leave empty)"
echo "   - Event types:"
echo "     ✅ s3:ObjectCreated:Put"
echo "     ✅ s3:ObjectCreated:CompleteMultipartUpload"
echo "   - Destination:"
echo "     Select 'SNS topic'"
echo "     Choose topic: ${SNS_TOPIC_NAME}"
echo ""
echo "6. Click 'Save changes'"
echo ""
read -p "Press Enter when event notification is created..."

echo ""
echo "=========================================="
echo "STEP 3: Configure SNS Subscription"
echo "=========================================="
echo ""
echo "1. Go back to SNS Console → Topics"
echo "   https://${AWS_REGION}.console.aws.amazon.com/sns/v3/home?region=${AWS_REGION}#/topics"
echo ""
echo "2. Click on topic: ${SNS_TOPIC_NAME}"
echo ""
echo "3. Click 'Create subscription' button"
echo ""
echo "4. Configure:"
echo "   - Protocol: HTTPS"
echo "   - Endpoint: ${WEBHOOK_ENDPOINT}"
echo "   - Enable raw message delivery: ✅ YES (important!)"
echo ""
echo "5. Click 'Create subscription'"
echo ""
echo "6. AWS will send a confirmation request to your endpoint"
echo "   The service should automatically confirm it"
echo ""
read -p "Press Enter when subscription is created..."

echo ""
echo "=========================================="
echo "STEP 4: Verify Configuration"
echo "=========================================="
echo ""

# Check if AWS CLI is available
if command -v aws &> /dev/null; then
    echo "Checking SNS topic..."
    TOPIC_ARN=$(aws sns list-topics --region ${AWS_REGION} --query "Topics[?contains(TopicArn, '${SNS_TOPIC_NAME}')].TopicArn" --output text 2>/dev/null || echo "")
    
    if [ -n "$TOPIC_ARN" ]; then
        echo "✅ Found SNS topic: ${TOPIC_ARN}"
        echo ""
        echo "Checking subscriptions..."
        SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic --topic-arn "${TOPIC_ARN}" --region ${AWS_REGION} --query "Subscriptions[?Endpoint=='${WEBHOOK_ENDPOINT}']" --output json 2>/dev/null || echo "[]")
        
        if echo "$SUBSCRIPTIONS" | grep -q "${WEBHOOK_ENDPOINT}"; then
            echo "✅ Subscription found for: ${WEBHOOK_ENDPOINT}"
            STATUS=$(echo "$SUBSCRIPTIONS" | grep -o '"SubscriptionArn":"[^"]*"' | head -1 | cut -d'"' -f4)
            if [ -n "$STATUS" ] && [ "$STATUS" != "PendingConfirmation" ]; then
                echo "✅ Subscription status: Confirmed"
            else
                echo "⚠️  Subscription status: Pending confirmation"
                echo "   The service should auto-confirm. Check logs if it doesn't."
            fi
        else
            echo "⚠️  Subscription not found. Please create it manually."
        fi
    else
        echo "⚠️  SNS topic not found. Please create it manually."
    fi
else
    echo "AWS CLI not installed. Please verify manually:"
    echo "  1. Check SNS topic exists: ${SNS_TOPIC_NAME}"
    echo "  2. Check subscription exists for: ${WEBHOOK_ENDPOINT}"
    echo "  3. Check subscription status is 'Confirmed'"
fi

echo ""
echo "=========================================="
echo "Testing"
echo "=========================================="
echo ""
echo "To test the setup:"
echo "1. Send a large email (>150 KB) with attachment to stashok@speakasap.com"
echo "2. Wait a few seconds"
echo "3. Check service logs:"
echo "   docker logs notifications-microservice-blue --since '5 minutes ago' | grep -E 'S3_PROCESS|s3|bucket'"
echo "4. Check database for the email"
echo ""
echo "Setup complete! 🎉"
echo ""
