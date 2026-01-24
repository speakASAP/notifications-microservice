#!/bin/bash

# SNS Subscription Check Script
# This script helps verify SNS subscription status for email receiving

set -e

echo "=========================================="
echo "AWS SNS Subscription Diagnostic Tool"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# SNS Topic ARN (update if different)
SNS_TOPIC_ARN="${1:-arn:aws:sns:eu-central-1:781206275849:inbound-email-speakasap}"
WEBHOOK_ENDPOINT="${2:-https://notifications.statex.cz/email/inbound}"
AWS_REGION="${AWS_SES_REGION:-eu-central-1}"

echo "Checking SNS Topic: ${SNS_TOPIC_ARN}"
echo "Expected Webhook Endpoint: ${WEBHOOK_ENDPOINT}"
echo "AWS Region: ${AWS_REGION}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}✗ AWS CLI not installed${NC}"
    echo "  → Install AWS CLI: https://aws.amazon.com/cli/"
    echo "  → Or check manually in AWS SNS Console"
    echo ""
    echo "Manual Check Steps:"
    echo "  1. Go to: https://${AWS_REGION}.console.aws.amazon.com/sns/v3/home?region=${AWS_REGION}#/topics"
    echo "  2. Find topic: ${SNS_TOPIC_ARN}"
    echo "  3. Click on the topic → Subscriptions tab"
    echo "  4. Verify subscription exists for: ${WEBHOOK_ENDPOINT}"
    echo "  5. Verify status is 'Confirmed' (not 'Pending confirmation')"
    exit 1
fi

echo "1. Checking SNS Topic Subscriptions..."
echo "----------------------------------------"

# List subscriptions for the topic
SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --region "${AWS_REGION}" \
    2>/dev/null || echo "")

if [ -z "$SUBSCRIPTIONS" ]; then
    echo -e "${RED}✗ No subscriptions found for topic${NC}"
    echo "  → This means emails are being stored in S3 but NOT reaching notifications-microservice"
    echo "  → You need to create a subscription"
    echo ""
    echo "Create subscription:"
    echo "  aws sns subscribe \\"
    echo "    --topic-arn ${SNS_TOPIC_ARN} \\"
    echo "    --protocol https \\"
    echo "    --notification-endpoint ${WEBHOOK_ENDPOINT} \\"
    echo "    --region ${AWS_REGION}"
    exit 1
fi

# Parse subscriptions (basic check)
SUBSCRIPTION_COUNT=$(echo "$SUBSCRIPTIONS" | grep -c "SubscriptionArn" || echo "0")

if [ "$SUBSCRIPTION_COUNT" -eq 0 ]; then
    echo -e "${RED}✗ No subscriptions found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Found ${SUBSCRIPTION_COUNT} subscription(s)${NC}"
echo ""

# Check each subscription
echo "$SUBSCRIPTIONS" | grep -A 5 "SubscriptionArn" | while IFS= read -r line; do
    if echo "$line" | grep -q "SubscriptionArn"; then
        ARN=$(echo "$line" | grep -o 'arn:aws:sns:[^"]*' || echo "")
        echo "  Subscription ARN: ${ARN}"
    elif echo "$line" | grep -q "Endpoint"; then
        ENDPOINT=$(echo "$line" | grep -o 'https://[^"]*' || echo "")
        echo "  Endpoint: ${ENDPOINT}"
        if [ "$ENDPOINT" = "$WEBHOOK_ENDPOINT" ]; then
            echo -e "    ${GREEN}✓ Matches expected endpoint${NC}"
        else
            echo -e "    ${YELLOW}⚠ Does not match expected endpoint${NC}"
        fi
    elif echo "$line" | grep -q "Protocol"; then
        PROTOCOL=$(echo "$line" | grep -o '"Protocol": "[^"]*"' | cut -d'"' -f4 || echo "")
        echo "  Protocol: ${PROTOCOL}"
        if [ "$PROTOCOL" = "https" ]; then
            echo -e "    ${GREEN}✓ Correct protocol${NC}"
        else
            echo -e "    ${YELLOW}⚠ Should be 'https'${NC}"
        fi
    fi
done

echo ""
echo "2. Checking Subscription Status..."
echo "------------------------------------"

# Get detailed subscription info
SUBSCRIPTION_ARNS=$(echo "$SUBSCRIPTIONS" | grep -o 'arn:aws:sns:[^"]*' || echo "")

if [ -z "$SUBSCRIPTION_ARNS" ]; then
    echo -e "${RED}✗ Could not extract subscription ARNs${NC}"
    exit 1
fi

echo "$SUBSCRIPTION_ARNS" | while read -r sub_arn; do
    if [ -z "$sub_arn" ]; then
        continue
    fi
    
    echo "Checking: ${sub_arn}"
    
    # Get subscription attributes
    STATUS=$(aws sns get-subscription-attributes \
        --subscription-arn "${sub_arn}" \
        --region "${AWS_REGION}" \
        --query 'Attributes.PendingConfirmation' \
        --output text 2>/dev/null || echo "unknown")
    
    if [ "$STATUS" = "false" ] || [ "$STATUS" = "None" ]; then
        echo -e "  ${GREEN}✓ Subscription is CONFIRMED${NC}"
    elif [ "$STATUS" = "true" ]; then
        echo -e "  ${RED}✗ Subscription is PENDING CONFIRMATION${NC}"
        echo "    → This is why emails are not reaching notifications-microservice!"
        echo "    → Check notifications-microservice logs for subscription confirmation"
        echo "    → Or manually confirm by visiting the SubscribeURL"
    else
        echo -e "  ${YELLOW}⚠ Status: ${STATUS}${NC}"
    fi
    
    # Get endpoint
    ENDPOINT=$(aws sns get-subscription-attributes \
        --subscription-arn "${sub_arn}" \
        --region "${AWS_REGION}" \
        --query 'Attributes.Endpoint' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$ENDPOINT" ]; then
        echo "  Endpoint: ${ENDPOINT}"
    fi
    
    echo ""
done

echo "3. Testing Webhook Endpoint..."
echo "-------------------------------"

# Test if endpoint is accessible
if curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${WEBHOOK_ENDPOINT}" | grep -q "200\|404\|405"; then
    echo -e "${GREEN}✓ Webhook endpoint is accessible${NC}"
else
    echo -e "${YELLOW}⚠ Webhook endpoint might not be accessible${NC}"
    echo "  → Check if notifications-microservice is running"
    echo "  → Check if the endpoint is correct: ${WEBHOOK_ENDPOINT}"
fi

echo ""
echo "=========================================="
echo "Summary and Next Steps"
echo "=========================================="
echo ""
echo "If subscription is PENDING CONFIRMATION:"
echo "  1. Check notifications-microservice logs for subscription confirmation"
echo "  2. The service should auto-confirm, but if it fails:"
echo "     - Go to AWS SNS Console → Subscriptions"
echo "     - Find the pending subscription"
echo "     - Click 'Confirm subscription' or visit the SubscribeURL"
echo ""
echo "If subscription is CONFIRMED but emails still not reaching:"
echo "  1. Check notifications-microservice logs:"
echo "     docker-compose logs -f notifications-microservice | grep -i 'inbound\|sns'"
echo "  2. Check database for received emails:"
echo "     SELECT * FROM inbound_emails ORDER BY \"receivedAt\" DESC LIMIT 10;"
echo "  3. Verify the recipient pattern in AWS SES receiving rule"
echo "     - Should be '@speakasap.com' (not '*@speakasap.com')"
echo ""
