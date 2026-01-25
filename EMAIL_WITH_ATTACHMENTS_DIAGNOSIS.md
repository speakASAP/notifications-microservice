# Email with Attachments Diagnosis

## Issue Summary

**Email sent**: 2026-01-25 23:23:13 +0200 (21:23:13 UTC)
**From**: SSF <lisapet@ukr.net>
**To**: SpeakASAP <contact@speakasap.com>
**Subject**: attachments
**Has attachment**: Yes (PDF file: 252004727.pdf)
**Message-ID**: `<1769376190.0600451000.ce6hxfip@frv63.fwdcdn.com>`

**Status**: ❌ **NOT received in helpdesk**

## Comparison

### Email 1 (Success) ✅

- **Time**: 23:21:08 +0200 (21:21:11 UTC)
- **To**: <stashok@speakasap.com>
- **Subject**: stashok
- **Attachments**: No
- **Status**: ✅ Processed and in database
- **Message-ID**: `bnu2177psop109ptkvco2q7913kksdnlq7948ug1`

### Email 2 (Failed) ❌

- **Time**: 23:23:13 +0200 (21:23:13 UTC)
- **To**: <contact@speakasap.com>
- **Subject**: attachments
- **Attachments**: Yes (PDF)
- **Status**: ❌ NOT in database, NOT processed
- **Message-ID**: `<1769376190.0600451000.ce6hxfip@frv63.fwdcdn.com>`

## Investigation Results

### 1. Service Logs

- ❌ **No POST request** to `/email/inbound` at 21:23:13 UTC
- ✅ POST request at 20:29:24 UTC (test email)
- ✅ POST request at 20:53:13 UTC (other email)
- ✅ POST request at 20:53:51 UTC to `/email/inbound/s3` (S3 event)

**Conclusion**: AWS SES did NOT send SNS notification for the email with attachments.

### 2. Database Check

- ❌ Email NOT found in `inbound_emails` table
- ✅ Other emails to <contact@speakasap.com> exist (older ones)

### 3. S3 Bucket Check

- ⚠️ **Unable to verify** (AWS CLI permissions or bucket access issue)
- Need to check manually in AWS Console

### 4. S3 Event Notifications

- ⚠️ **Unable to verify** (AWS CLI permissions)
- Need to check manually in AWS Console

## Root Cause Analysis

### Most Likely Causes

1. **Email too large for SNS notification** (>150 KB)
   - AWS SES saves to S3 but doesn't send SNS notification
   - S3 event notifications not configured → email stuck in S3
   - **Solution**: Configure S3 event notifications

2. **Email not received by AWS SES**
   - MX records issue for <contact@speakasap.com>
   - AWS SES receiving rule doesn't match <contact@speakasap.com>
   - **Solution**: Check AWS SES receiving rule configuration

3. **SNS notification sent but failed**
   - Service didn't receive it (network issue)
   - Service received but failed to process
   - **Solution**: Check service logs for errors

## Next Steps

### Immediate Actions

1. **Check AWS SES Console**:
   - Go to AWS SES Console → Email Receiving → Rule Sets
   - Verify rule matches `@speakasap.com` (should include <contact@speakasap.com>)
   - Check if email was received (look for bounce/complaint)

2. **Check S3 Bucket**:
   - Go to AWS S3 Console → `speakasap-email-forward` bucket
   - Check `forwards/` prefix for emails around 21:23 UTC
   - Look for object with timestamp matching the email

3. **Check S3 Event Notifications**:
   - Go to S3 Console → Bucket → Properties → Event notifications
   - Verify event notification exists for `forwards/` prefix
   - Verify SNS topic subscription is confirmed

4. **Check SNS Subscriptions**:
   - Go to AWS SNS Console → Subscriptions
   - Verify subscription to `https://notifications.statex.cz/email/inbound/s3` exists
   - Verify status is "Confirmed"

### Manual Recovery

If email is found in S3:

```bash
# Get object key from S3
aws s3 ls s3://speakasap-email-forward/forwards/ --recursive | grep "2026-01-25.*21:2"

# Process manually
curl -X POST https://notifications.statex.cz/email/inbound/s3 \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "speakasap-email-forward",
    "key": "forwards/<object-key-from-s3>"
  }'
```

## Configuration Check

### Required AWS Configuration

1. **SES Receiving Rule**:
   - ✅ Should match `@speakasap.com` (includes <contact@speakasap.com>)
   - ✅ Action 1: Save to S3 bucket (`speakasap-email-forward` with prefix `forwards/`)
   - ✅ Action 2: Publish to SNS topic (`inbound-email-speakasap`)

2. **S3 Event Notifications** (CRITICAL for emails with attachments):
   - ⚠️ **MUST BE CONFIGURED** for automatic processing
   - Event types: `s3:ObjectCreated:Put`, `s3:ObjectCreated:CompleteMultipartUpload`
   - Prefix: `forwards/`
   - Destination: SNS topic → `https://notifications.statex.cz/email/inbound/s3`

3. **SNS Subscriptions**:
   - ✅ SES notifications: `https://notifications.statex.cz/email/inbound` (raw delivery: Yes recommended)
   - ⚠️ S3 events: `https://notifications.statex.cz/email/inbound/s3` (raw delivery: Yes)

## Recommendations

1. **Configure S3 Event Notifications** (if not already done)
   - This ensures emails >150KB are processed automatically
   - See: `docs/S3_EVENT_NOTIFICATIONS_SETUP.md`

2. **Verify SES Receiving Rule**
   - Ensure it matches `@speakasap.com` (not just specific addresses)
   - Verify both S3 and SNS actions are configured

3. **Check Email Size**
   - If email is very large (>10MB), may need different handling
   - Consider storing attachments separately

4. **Monitor S3 Bucket**
   - Regularly check S3 for unprocessed emails
   - Set up alerts for emails older than X minutes in S3

## Testing

To test email with attachments processing:

1. Send test email with small attachment (<150KB) to <contact@speakasap.com>
2. Verify it's processed via SNS notification
3. Send test email with large attachment (>150KB) to <contact@speakasap.com>
4. Verify it's processed via S3 event notification
5. Check both appear in database and helpdesk
