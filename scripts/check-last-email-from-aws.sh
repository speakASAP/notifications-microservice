#!/bin/bash

# Check Last Email from AWS
# This script checks when the latest email was received from AWS SES

set -e

echo "=========================================="
echo "Checking Last Email from AWS SES"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're on production server
if [ -z "$SSH_CONNECTION" ] && [ "$(hostname)" != "statex" ]; then
    echo -e "${YELLOW}⚠ This script should be run on production server${NC}"
    echo "  → Run: ssh statex 'cd ~/notifications-microservice && ./scripts/check-last-email-from-aws.sh'"
    echo ""
fi

# 1. Check database for last email
echo "1. Checking Database for Last Email..."
echo "---------------------------------------"
if command -v psql &> /dev/null; then
    # Try to get database connection from .env
    if [ -f .env ]; then
        source .env
        DB_HOST="${DB_HOST:-db-server-postgres}"
        DB_PORT="${DB_PORT:-5432}"
        DB_USER="${DB_USER:-dbadmin}"
        DB_NAME="${DB_NAME:-notifications}"
        
        # Query for last email
        LAST_EMAIL=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
            SELECT 
                id,
                \"from\",
                \"to\",
                subject,
                \"receivedAt\",
                status,
                \"rawData\"->>'mail'->>'messageId' as message_id
            FROM inbound_emails
            ORDER BY \"receivedAt\" DESC
            LIMIT 1;
        " 2>/dev/null || echo "")
        
        if [ -n "$LAST_EMAIL" ] && [ "$LAST_EMAIL" != "" ]; then
            echo -e "${GREEN}✓ Last email found in database:${NC}"
            echo "$LAST_EMAIL" | while IFS='|' read -r id from to subject received_at status message_id; do
                echo "  ID: $(echo $id | xargs)"
                echo "  From: $(echo $from | xargs)"
                echo "  To: $(echo $to | xargs)"
                echo "  Subject: $(echo $subject | xargs)"
                echo "  Received At: $(echo $received_at | xargs)"
                echo "  Status: $(echo $status | xargs)"
                echo "  Message ID: $(echo $message_id | xargs)"
            done
        else
            echo -e "${RED}✗ No emails found in database${NC}"
        fi
        
        # Count emails in last 24 hours
        EMAILS_24H=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
            SELECT COUNT(*)
            FROM inbound_emails
            WHERE \"receivedAt\" > NOW() - INTERVAL '24 hours';
        " 2>/dev/null | xargs || echo "0")
        
        echo ""
        echo "Emails in last 24 hours: $EMAILS_24H"
        
        # Check for stashok@speakasap.com specifically
        STASHOK_EMAILS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
            SELECT 
                \"receivedAt\",
                \"from\",
                subject,
                status
            FROM inbound_emails
            WHERE \"to\" = 'stashok@speakasap.com'
            ORDER BY \"receivedAt\" DESC
            LIMIT 5;
        " 2>/dev/null || echo "")
        
        if [ -n "$STASHOK_EMAILS" ] && [ "$STASHOK_EMAILS" != "" ]; then
            echo ""
            echo -e "${GREEN}✓ Recent emails to stashok@speakasap.com:${NC}"
            echo "$STASHOK_EMAILS"
        else
            echo ""
            echo -e "${YELLOW}⚠ No recent emails to stashok@speakasap.com found${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ .env file not found${NC}"
    fi
else
    echo -e "${YELLOW}⚠ psql not available${NC}"
fi
echo ""

# 2. Check service logs for last SNS notification
echo "2. Checking Service Logs for Last SNS Notification..."
echo "-----------------------------------------------------"
if [ -f docker-compose.yml ] || docker ps | grep -q notifications-microservice; then
    echo "Checking logs for last SNS notification..."
    LAST_SNS_LOG=$(docker logs notifications-microservice 2>&1 | grep -i "SNS\|inbound\|notification" | tail -5 || echo "")
    if [ -n "$LAST_SNS_LOG" ]; then
        echo -e "${GREEN}✓ Recent SNS/inbound activity:${NC}"
        echo "$LAST_SNS_LOG"
    else
        echo -e "${YELLOW}⚠ No recent SNS/inbound activity in logs${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Docker not available or service not running${NC}"
fi
echo ""

# 3. Check AWS S3 bucket for last email (if AWS CLI available)
echo "3. Checking AWS S3 Bucket for Last Email..."
echo "--------------------------------------------"
if command -v aws &> /dev/null; then
    if [ -f .env ]; then
        source .env
        S3_BUCKET="${AWS_SES_S3_BUCKET:-speakasap-email-forward}"
        S3_PREFIX="${AWS_SES_S3_OBJECT_KEY_PREFIX:-forwards/}"
        AWS_REGION="${AWS_SES_REGION:-eu-central-1}"
        
        echo "Checking S3 bucket: $S3_BUCKET (prefix: $S3_PREFIX)"
        
        LAST_S3_OBJECT=$(aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX" --region "$AWS_REGION" --recursive 2>/dev/null | sort -r | head -1 || echo "")
        
        if [ -n "$LAST_S3_OBJECT" ]; then
            echo -e "${GREEN}✓ Last email in S3:${NC}"
            echo "  $LAST_S3_OBJECT"
            
            # Extract date from S3 object
            S3_DATE=$(echo "$LAST_S3_OBJECT" | awk '{print $1" "$2}')
            echo "  Date: $S3_DATE"
        else
            echo -e "${YELLOW}⚠ No emails found in S3 bucket${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ .env file not found${NC}"
    fi
else
    echo -e "${YELLOW}⚠ AWS CLI not available${NC}"
    echo "  → Install AWS CLI or check S3 bucket manually in AWS Console"
fi
echo ""

# 4. Check SNS subscription status
echo "4. Checking SNS Subscription Status..."
echo "---------------------------------------"
if command -v aws &> /dev/null && [ -f .env ]; then
    source .env
    SNS_TOPIC_ARN="${AWS_SES_SNS_TOPIC_ARN}"
    AWS_REGION="${AWS_SES_REGION:-eu-central-1}"
    
    if [ -n "$SNS_TOPIC_ARN" ]; then
        echo "Checking SNS topic: $SNS_TOPIC_ARN"
        
        SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic \
            --topic-arn "$SNS_TOPIC_ARN" \
            --region "$AWS_REGION" \
            2>/dev/null || echo "")
        
        if [ -n "$SUBSCRIPTIONS" ]; then
            echo -e "${GREEN}✓ SNS subscriptions:${NC}"
            echo "$SUBSCRIPTIONS" | grep -E "Endpoint|SubscriptionArn|SubscriptionStatus" || echo "$SUBSCRIPTIONS"
        else
            echo -e "${YELLOW}⚠ Could not retrieve SNS subscriptions${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ AWS_SES_SNS_TOPIC_ARN not configured in .env${NC}"
    fi
else
    echo -e "${YELLOW}⚠ AWS CLI not available or .env not found${NC}"
fi
echo ""

# 5. Summary and recommendations
echo "=========================================="
echo "Summary and Recommendations"
echo "=========================================="
echo ""
echo "If no emails found:"
echo "  1. Check AWS SES Console → Email Receiving → Rule Sets"
echo "     → Verify rule exists for '@speakasap.com' (not '*@speakasap.com')"
echo "     → Verify rule has S3 and SNS actions configured"
echo ""
echo "  2. Check SNS subscription:"
echo "     → Go to AWS SNS Console → Subscriptions"
echo "     → Verify subscription to https://notifications.statex.cz/email/inbound"
echo "     → Verify status is 'Confirmed'"
echo ""
echo "  3. Check MX records:"
echo "     → Run: dig MX speakasap.com"
echo "     → Should point to AWS SES inbound mail server"
echo ""
echo "  4. Check service logs:"
echo "     → docker logs notifications-microservice | grep -i inbound"
echo ""
echo "  5. Test by sending email:"
echo "     → Send test email to stashok@speakasap.com"
echo "     → Check S3 bucket for email"
echo "     → Check service logs for SNS notification"
echo ""
