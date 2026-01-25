#!/bin/bash

# Email Receiving Configuration Check Script
# This script helps diagnose email receiving issues with AWS SES

set -e

echo "=========================================="
echo "AWS SES Email Receiving Diagnostic Tool"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if domain is provided
DOMAIN="${1:-speakasap.com}"
echo "Checking configuration for domain: ${DOMAIN}"
echo ""

# 1. Check MX Records
echo "1. Checking MX Records..."
echo "-----------------------"
MX_RECORDS=$(dig MX ${DOMAIN} +short 2>/dev/null || echo "")
if [ -z "$MX_RECORDS" ]; then
    echo -e "${RED}✗ No MX records found for ${DOMAIN}${NC}"
    echo "  → This means emails cannot be delivered to ${DOMAIN}"
    echo "  → You need to add MX records pointing to AWS SES inbound mail server"
else
    echo -e "${GREEN}✓ MX records found:${NC}"
    echo "$MX_RECORDS" | while read -r line; do
        echo "  $line"
        if echo "$line" | grep -q "amazonaws.com"; then
            echo -e "    ${GREEN}✓ Points to AWS SES${NC}"
        else
            echo -e "    ${YELLOW}⚠ Does not point to AWS SES${NC}"
        fi
    done
fi
echo ""

# 2. Check if domain is verified (requires AWS CLI)
echo "2. Checking AWS SES Domain Verification..."
echo "-------------------------------------------"
if command -v aws &> /dev/null; then
    AWS_REGION="${AWS_SES_REGION:-eu-central-1}"
    echo "Using AWS region: ${AWS_REGION}"
    
    # Check if domain is verified
    VERIFIED=$(aws sesv2 get-email-identity --email-identity ${DOMAIN} --region ${AWS_REGION} 2>/dev/null || echo "")
    if [ -z "$VERIFIED" ]; then
        echo -e "${RED}✗ Domain ${DOMAIN} is not verified in AWS SES${NC}"
        echo "  → Go to AWS SES Console → Verified identities"
        echo "  → Verify the domain ${DOMAIN}"
    else
        VERIFICATION_STATUS=$(echo "$VERIFIED" | grep -o '"VerificationStatus":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        if [ "$VERIFICATION_STATUS" = "SUCCESS" ]; then
            echo -e "${GREEN}✓ Domain ${DOMAIN} is verified in AWS SES${NC}"
        else
            echo -e "${YELLOW}⚠ Domain ${DOMAIN} verification status: ${VERIFICATION_STATUS}${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠ AWS CLI not installed. Skipping AWS SES verification check.${NC}"
    echo "  → Install AWS CLI: https://aws.amazon.com/cli/"
    echo "  → Or check manually in AWS SES Console → Verified identities"
fi
echo ""

# 3. Check DNS records for domain verification
echo "3. Checking DNS Records for Domain Verification..."
echo "---------------------------------------------------"
echo "Note: This requires manual verification in your DNS provider"
echo "Required DNS records for AWS SES domain verification:"
echo "  - DKIM records (3 CNAME records)"
echo "  - SPF record (TXT record)"
echo "  - DMARC record (TXT record)"
echo ""
echo "Check your DNS provider for these records."
echo ""

# 4. Instructions for AWS SES Console checks
echo "4. Manual Checks Required in AWS SES Console:"
echo "--------------------------------------------"
echo ""
echo "A. Receiving Rule Sets:"
echo "   1. Go to AWS SES Console → Email Receiving → Rule Sets"
echo "   2. Verify that an active rule set exists"
echo "   3. Verify that a rule exists matching '@${DOMAIN}' (not '*@${DOMAIN}')"
echo "   4. Verify that the rule has TWO actions (in order):"
echo "      a. Action 1: 'Save to S3 bucket' (ensures no emails are lost)"
echo "      b. Action 2: 'Publish to SNS topic'"
echo "   5. Verify S3 bucket is configured and accessible"
echo ""
echo "B. S3 Bucket Configuration:"
echo "   1. Go to AWS S3 Console"
echo "   2. Verify bucket exists (e.g., speakasap-inbound-emails)"
echo "   3. Check bucket policy allows SES service to write"
echo "   4. Verify emails are being saved (check bucket contents)"
echo ""
echo "C. SNS Topic Subscription:"
echo "   1. Go to AWS SNS Console → Subscriptions"
echo "   2. Find subscription for your SNS topic"
echo "   3. Verify endpoint: https://notifications.statex.cz/email/inbound"
echo "   4. Verify status: 'Confirmed' (not 'Pending confirmation')"
echo ""
echo "D. Account Status:"
echo "   1. Go to AWS SES Console → Account dashboard"
echo "   2. Check if account is in 'Sandbox' mode"
echo "   3. In sandbox mode, only verified email addresses can receive emails"
echo ""

# 5. Test email receiving
echo "5. Testing Email Receiving:"
echo "---------------------------"
echo "To test email receiving:"
echo "  1. Send a test email to test@${DOMAIN} from an external email address"
echo "  2. Check notifications-microservice logs:"
echo "     docker-compose logs -f notifications-microservice | grep -i inbound"
echo "  3. Check database for received emails:"
echo "     SELECT * FROM inbound_emails WHERE \"to\" = 'test@${DOMAIN}' ORDER BY \"receivedAt\" DESC LIMIT 10;"
echo ""

# 6. Common issues summary
echo "=========================================="
echo "Common Issues and Solutions:"
echo "=========================================="
echo ""
echo "Issue: 550 5.1.1 mailbox unavailable"
echo "  → Domain not verified in AWS SES"
echo "  → MX records not pointing to AWS SES"
echo "  → Receiving rule set not configured"
echo "  → SNS subscription not confirmed"
echo "  → Using '*@domain.com' instead of '@domain.com' in rule"
echo ""
echo "Issue: Emails with attachments (>150 KB) not processed"
echo "  → Email exceeds 150 KB SNS limit"
echo "  → SNS notification may not include email content"
echo "  → Solution: Set up S3 event notifications (see section E above)"
echo "  → Or manually process: POST /email/inbound/s3 with {bucket, key}"
echo ""
echo "For detailed troubleshooting, see:"
echo "  notifications-microservice/docs/EMAIL_DELIVERY_TROUBLESHOOTING.md"
echo ""
