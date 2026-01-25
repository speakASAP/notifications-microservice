#!/bin/bash

# Script to check if new S3 subscriptions are working

echo "=========================================="
echo "Check New S3 Subscriptions Status"
echo "=========================================="
echo ""

echo "Since you created new subscriptions, let's verify they're working:"
echo ""

echo "1. Check if service received any confirmation requests:"
echo "   ssh statex \"docker logs notifications-microservice-blue --since 5m | grep -i 's3\|subscription'\""
echo ""

echo "2. Check recent activity on /email/inbound/s3 endpoint:"
echo "   ssh statex \"docker logs notifications-microservice-blue --tail 100 | grep '/email/inbound/s3'\""
echo ""

echo "3. Test endpoint manually:"
echo "   curl -X POST https://notifications.statex.cz/email/inbound/s3 -H 'Content-Type: application/json' -d '{\"test\":\"ping\"}'"
echo ""

echo "=========================================="
echo "About Old Subscriptions You Can't Delete"
echo "=========================================="
echo ""

echo "If you can't delete old subscriptions in AWS Console:"
echo ""
echo "REASON: Usually one of these:"
echo "  - IAM permissions issue (need sns:Unsubscribe permission)"
echo "  - Subscription is in 'Deleting' state (wait 5-10 minutes)"
echo "  - AWS Console UI bug (try different browser/incognito)"
echo "  - Subscription is attached to a resource that prevents deletion"
echo ""

echo "SOLUTIONS:"
echo ""
echo "Option A: Leave them (recommended if new ones work)"
echo "  - Old pending subscriptions won't cause issues"
echo "  - AWS will ignore them"
echo "  - Focus on making new subscriptions work"
echo ""

echo "Option B: Delete via AWS CLI"
echo "  aws sns unsubscribe --subscription-arn '<ARN>' --region eu-central-1"
echo ""

echo "Option C: Delete from subscription details page"
echo "  1. Go to: https://eu-central-1.console.aws.amazon.com/sns/v3/home?region=eu-central-1#/subscriptions"
echo "  2. Click on the subscription (opens details page)"
echo "  3. Look for 'Delete' button in the details page"
echo ""

echo "Option D: Wait and retry"
echo "  - Sometimes AWS needs time to process"
echo "  - Refresh page after 5-10 minutes"
echo ""

echo "=========================================="
echo "Next Steps"
echo "=========================================="
echo ""
echo "1. Verify new subscriptions are confirmed in AWS Console"
echo "2. Check if service received confirmation requests"
echo "3. Test by uploading a file to S3 bucket (forwards/ prefix)"
echo "4. Monitor logs to see if S3 events are processed"
echo ""
