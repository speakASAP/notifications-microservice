# S3 Event Notification Setup for s3-email-events-new

## Summary

✅ **No codebase changes needed** - The service already supports any SNS topic name for S3 events.

The endpoint `/email/inbound/s3` handles S3 event notifications from any SNS topic, including `s3-email-events-new`.

## Configuration Steps

### 1. Create S3 Event Notification

1. Navigate to: <https://eu-central-1.console.aws.amazon.com/s3/buckets/speakasap-email-forward?region=eu-central-1&tab=properties>s>
2. Scroll down to **Event notifications** section
3. Click **Create event notification**
4. Configure:
   - **Event name**: `ProcessInboundEmails`
   - **Prefix**: `forwards/` (must match SES rule object key prefix)
   - **Suffix**: (leave empty)
   - **Event types**:
     - ✅ `s3:ObjectCreated:Put`
     - ✅ `s3:ObjectCreated:CompleteMultipartUpload`
   - **Destination**:
     - Select **SNS topic**
     - Choose topic: **`s3-email-events-new`**
5. Click **Save changes**

### 2. Verify SNS Subscription

After creating the event notification, verify the SNS subscription:

1. Go to AWS SNS Console → Topics → `s3-email-events-new`
2. Check subscriptions:
   - **Endpoint**: `https://notifications.statex.cz/email/inbound/s3`
   - **Status**: Should be "Confirmed"
   - **Raw message delivery**: Should be "Yes"

### 3. Create Subscription (if missing)

If subscription doesn't exist:

1. Go to AWS SNS Console → Topics → `s3-email-events-new`
2. Click **Create subscription**
3. Configure:
   - **Protocol**: HTTPS
   - **Endpoint**: `https://notifications.statex.cz/email/inbound/s3`
   - **Enable raw message delivery**: **Yes** (important!)
4. Click **Create subscription**
5. The service will automatically confirm the subscription

## Testing

After setup, test with a large email:

1. Send email with attachment (>150 KB) to `contact@speakasap.com` or `stashok@speakasap.com`
2. Check service logs (use the running container: blue or green):

   ```bash
   docker logs notifications-microservice-green --since '5 minutes ago' | grep -E 'S3_PROCESS|s3|bucket'
   # or: notifications-microservice-blue

   ```

3. Check database for the email

4. Verify it appears in helpdesk
5. Optional: check for any S3 backlog (unprocessed emails):

   ```bash
   curl -s "https://notifications.statex.cz/email/inbound/s3-unprocessed?maxKeys=500"
   ```

   If `unprocessed` array is empty after new emails, S3 events are working.

## How It Works

```
AWS SES receives email (>150 KB)
  ↓
Action 1: Save to S3 bucket ✅
  ↓
S3 Event Notification (NEW)
  ↓
SNS Topic: s3-email-events-new
  ↓
HTTPS Webhook → /email/inbound/s3
  ↓

Service fetches email from S3 and processes it
```

The service endpoint `/email/inbound/s3` automatically:

- Handles SNS subscription confirmations
- Processes S3 event notifications (from any SNS topic)
- Fetches email from S3
- Parses and stores email in database
- Forwards to helpdesk via webhook
