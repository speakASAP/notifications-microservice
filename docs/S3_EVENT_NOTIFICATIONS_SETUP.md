# S3 Event Notifications Setup Guide

## Overview

When emails exceed 150 KB, AWS SES cannot include the email content in SNS notifications. While the email is saved to S3, the SNS notification may fail or not include the S3 bucket information. To ensure all emails are processed automatically, we set up S3 event notifications.

## Architecture

```text
AWS SES receives email (>150 KB)
  ↓
Action 1: Save to S3 bucket ✅
  ↓
Action 2: Publish to SNS (may fail or not include content)
  ↓
S3 Event Notification (NEW)
  ↓
SNS Topic (s3-email-events)
  ↓
HTTPS Webhook → /email/inbound/s3
  ↓
Service fetches email from S3 and processes it
```

## Setup Steps

### 1. Create SNS Topic for S3 Events

1. Go to AWS SNS Console: <https://console.aws.amazon.com/sns>
2. Click "Create topic"
3. Configure:
   - **Type**: Standard
   - **Name**: `s3-email-events` (or any name you prefer)
   - **Display name**: (optional)
4. Click "Create topic"
5. **Note the Topic ARN** (e.g., `arn:aws:sns:eu-central-1:781206275849:s3-email-events`)

### 2. Configure S3 Bucket Event Notifications

1. Go to AWS S3 Console: <https://console.aws.amazon.com/s3>
2. Select your bucket: `speakasap-email-forward`
3. Go to **Properties** tab
4. Scroll down to **Event notifications**
5. Click **Create event notification**
6. Configure:
   - **Event name**: `ProcessInboundEmails`
   - **Prefix**: `forwards/` (must match your SES rule object key prefix)
   - **Suffix**: (leave empty)
   - **Event types**:
     - ✅ `s3:ObjectCreated:Put` (when email is saved)
     - ✅ `s3:ObjectCreated:CompleteMultipartUpload` (for large uploads)
   - **Destination**:
     - Select **SNS topic**
     - Choose your topic: `s3-email-events`
7. Click **Save changes**

### 3. Configure SNS Subscription

1. Go to AWS SNS Console → Topics
2. Select your topic: `s3-email-events`
3. Click **Create subscription**
4. Configure:
   - **Protocol**: HTTPS
   - **Endpoint**: `https://notifications.statex.cz/email/inbound/s3`
   - **Enable raw message delivery**: **Yes** (important for S3 events)
5. Click **Create subscription**
6. AWS will send a confirmation request to your endpoint
7. The service automatically confirms the subscription
8. Verify subscription status is **Confirmed** (not Pending)

### 4. Verify Configuration

1. **Test with a large email**:
   - Send an email with attachment (>150 KB) to `stashok@speakasap.com`
   - Wait a few seconds

2. **Check S3 bucket**:
   - Go to S3 Console → Your bucket
   - Verify email file exists in `forwards/` prefix

3. **Check service logs**:

   ```bash
   docker logs notifications-microservice-blue --since '5 minutes ago' | grep -E 'S3_PROCESS|s3|bucket'
   ```

4. **Check database**:

   ```sql
   SELECT id, "from", "to", subject, "receivedAt", 
          CASE WHEN attachments IS NULL THEN 0 ELSE jsonb_array_length(attachments) END as attachments
   FROM inbound_emails 
   ORDER BY "receivedAt" DESC LIMIT 5;
   ```

5. **Check helpdesk**: Verify ticket was created with attachment

## Manual Processing

If an email is in S3 but wasn't processed automatically:

### Option 1: API Endpoint

```bash
curl -X POST https://notifications.statex.cz/email/inbound/s3 \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "speakasap-email-forward",
    "key": "forwards/3o1q7pqbgd4ivqh2281gqcqgugar5jtai0bo3fo1"
  }'
```

### Option 2: Script

```bash
cd notifications-microservice
ts-node scripts/process-s3-email.ts speakasap-email-forward forwards/3o1q7pqbgd4ivqh2281gqcqgugar5jtai0bo3fo1
```

## Troubleshooting

### Issue: S3 events not triggering

**Check**:

1. S3 event notification is configured correctly
2. Prefix matches exactly (case-sensitive)
3. SNS subscription is confirmed
4. Service endpoint is accessible: `https://notifications.statex.cz/email/inbound/s3`

**Solution**:

- Verify S3 event notification prefix matches your object key prefix
- Check SNS subscription status
- Check service logs for incoming requests

### Issue: Service receives S3 event but fails to process

**Check logs**:

```bash
docker logs notifications-microservice-blue | grep -A 20 'S3_PROCESS'
```

**Common causes**:

- S3 bucket permissions (service needs read access)
- Invalid email format in S3
- Network issues fetching from S3

### Issue: Duplicate processing

The service checks for existing emails by messageId and S3 object key to prevent duplicates. If duplicates occur:

- Check database for existing email with same messageId
- Service should skip processing if email already exists

## Benefits

✅ **Automatic processing**: All emails processed automatically, even >150 KB
✅ **No email loss**: Emails saved to S3 are guaranteed to be processed
✅ **Redundancy**: Works even if SNS notification fails
✅ **Recovery**: Can manually process any email from S3

## API Endpoints

### Process Email from S3

- **Endpoint**: `POST /email/inbound/s3`
- **Body**:

  ```json
  {
    "bucket": "speakasap-email-forward",
    "key": "forwards/object-key"
  }
  ```

- **Response**:

  ```json
  {
    "success": true,
    "message": "Email processed successfully from S3",
    "id": "email-uuid",
    "attachments": 1
  }
  ```

### S3 Event Notification Format

S3 events are sent via SNS in this format:

```json
{
  "Records": [
    {
      "s3": {
        "bucket": {
          "name": "speakasap-email-forward"
        },
        "object": {
          "key": "forwards/object-key"
        }
      }
    }
  ]
}
```

The service automatically handles this format.
