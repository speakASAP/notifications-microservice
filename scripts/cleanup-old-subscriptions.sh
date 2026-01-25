#!/bin/bash

# Script to help clean up old SNS subscriptions that can't be deleted via console

set -e

echo "=========================================="
echo "Cleanup Old SNS Subscriptions"
echo "=========================================="
echo ""

TOPIC_ARN="arn:aws:sns:eu-central-1:781206275849:s3-email-events"
OLD_SUBSCRIPTION_ARN="arn:aws:sns:eu-central-1:781206275849:s3-email-events:fc776e48-1515-450b-9513-1e90b83e39f3"

echo "If you can't delete subscriptions in AWS Console, try these options:"
echo ""

echo "OPTION 1: Use AWS CLI (if available)"
echo "----------------------------------------"
if command -v aws &> /dev/null; then
    echo "Listing all subscriptions for topic: ${TOPIC_ARN}"
    echo ""
    aws sns list-subscriptions-by-topic \
        --topic-arn "${TOPIC_ARN}" \
        --region eu-central-1 \
        --output table 2>/dev/null || echo "Failed to list subscriptions"
    
    echo ""
    echo "To delete a subscription:"
    echo "  aws sns unsubscribe --subscription-arn '<SUBSCRIPTION_ARN>' --region eu-central-1"
else
    echo "AWS CLI not installed. Install it or use Option 2."
fi

echo ""
echo "OPTION 2: Delete via AWS Console (alternative method)"
echo "----------------------------------------"
echo "1. Go to: https://eu-central-1.console.aws.amazon.com/sns/v3/home?region=eu-central-1#/subscriptions"
echo "2. Find the subscription you want to delete"
echo "3. Click on the subscription (not the checkbox)"
echo "4. This opens the subscription details page"
echo "5. Look for 'Delete subscription' button at the top or bottom"
echo "6. If still not visible, check:"
echo "   - You have proper IAM permissions"
echo "   - The subscription is not in a 'Deleting' state (wait a few minutes)"
echo "   - Try refreshing the page"
echo ""

echo "OPTION 3: Leave old subscriptions (if new ones work)"
echo "----------------------------------------"
echo "If your new subscriptions are working and confirmed,"
echo "you can leave the old pending subscriptions."
echo "They won't cause any issues - AWS will just ignore them."
echo ""

echo "OPTION 4: Check subscription state"
echo "----------------------------------------"
echo "Sometimes subscriptions are in a 'Deleting' state and need time."
echo "Check the subscription status in AWS Console."
echo "If it shows 'Deleting', wait 5-10 minutes and refresh."
echo ""

echo "To verify new subscriptions are working:"
echo "  ssh statex \"docker logs notifications-microservice-blue -f | grep -i 's3\|subscription'\""
echo ""
