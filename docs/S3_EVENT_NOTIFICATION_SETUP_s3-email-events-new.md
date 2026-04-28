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
   - **Endpoint**: `https://notifications.alfares.cz/email/inbound/s3`
   - **Status**: Should be "Confirmed"
   - **Raw message delivery**: Should be "Yes"

### 3. Create Subscription (if missing)

If subscription doesn't exist:

1. Go to AWS SNS Console → Topics → `s3-email-events-new`
2. Click **Create subscription**
3. Configure:
   - **Protocol**: HTTPS
   - **Endpoint**: `https://notifications.alfares.cz/email/inbound/s3`
   - **Enable raw message delivery**: **Yes** (important!)
4. Click **Create subscription**
5. The service will automatically confirm the subscription

## Testing

After setup, test with a large email:

1. Send email with attachment (>150 KB) to `contact@speakasap.com` or `stashok@speakasap.com`
2. Check service logs:

   ```bash
   kubectl logs -n statex-apps deploy/notifications-microservice --since=5m | grep -E 'S3_PROCESS|s3|bucket'
   ```

3. Check database for the email
4. Verify it appears in helpdesk
5. Optional: check for any S3 backlog:

   ```bash
   curl -s "https://notifications.alfares.cz/email/inbound/s3-unprocessed?maxKeys=500"
   ```

## Manual Processing

If an email is in S3 but wasn't processed automatically:

```bash
# Via API
curl -X POST https://notifications.alfares.cz/email/inbound/s3 \
  -H "Content-Type: application/json" \
  -d '{"bucket": "speakasap-email-forward", "key": "forwards/<object-key>"}'

# Via script
ts-node scripts/process-s3-email.ts speakasap-email-forward forwards/<object-key>
```

## Troubleshooting

**S3 events not triggering:**
- Verify S3 event notification prefix matches exactly (`forwards/`, case-sensitive)
- Check SNS subscription status is Confirmed
- Verify service endpoint reachable: `https://notifications.alfares.cz/email/inbound/s3`

**Service receives event but fails:**
```bash
kubectl logs -n statex-apps deploy/notifications-microservice | grep -A 20 'S3_PROCESS'
```
Common causes: S3 bucket read permissions, invalid email format in S3, network issues.

**Duplicate processing:** Service deduplicates by messageId and S3 object key — duplicates are skipped automatically.

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
