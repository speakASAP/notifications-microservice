# S3-First Strategy for Email Processing

## Overview

This document explains the **S3-first strategy** for processing inbound emails, where the service always fetches emails from S3 (when configured) instead of relying on email content in SNS notifications. This ensures all emails, including those with large attachments, are processed correctly.

## How It Works

### Current Behavior

When both S3 and SNS actions are configured in AWS SES:

1. **AWS SES receives email** → Saves to S3 → Sends SNS notification
2. **Service receives SNS notification**:
   - If email < 100 KB: Uses content from notification (faster)
   - If email >= 100 KB OR S3 bucket configured: **Always fetches from S3** (ensures full content with attachments)

### Why S3-First?

**Problem**: AWS SES has a 150 KB limit for SNS notifications. Emails larger than this:

- May not include content in SNS notification
- May not include S3 bucket info in notification
- Result in emails not being processed

**Solution**: Configure S3 bucket in environment variables, and the service will:

- Always try to fetch from S3 if bucket is known
- Construct object key from messageId and prefix if not provided
- Fall back to notification content only if S3 fetch fails

## Configuration

### 1. Environment Variables

Add to `.env`:

```env
# AWS SES S3 Bucket Configuration (for S3-first strategy)
AWS_SES_S3_BUCKET=speakasap-email-forward
AWS_SES_S3_OBJECT_KEY_PREFIX=forwards/
```

**Important**: These must match your SES receiving rule configuration:

- `AWS_SES_S3_BUCKET` = S3 bucket name in SES rule
- `AWS_SES_S3_OBJECT_KEY_PREFIX` = Object key prefix in SES rule (e.g., `forwards/`)

### 2. AWS SES Receiving Rule

Configure both actions (in order):

1. **Action 1**: Save to S3 bucket → `speakasap-email-forward` with prefix `forwards/`
2. **Action 2**: Publish to SNS topic → `inbound-email-speakasap`

### 3. SNS Subscription

- Endpoint: `https://notifications.statex.cz/email/inbound`
- Enable raw message delivery: **No** (needed for SES notifications)

## Processing Flow

```text
1. AWS SES receives email
   ↓
2. Action 1: Save to S3 (bucket: speakasap-email-forward, key: forwards/{messageId})
   ↓
3. Action 2: Send SNS notification (may or may not include content)
   ↓
4. Service receives SNS notification
   ↓
5. Service checks:
   - Is S3 bucket configured? (from env or notification)
   - If YES → Fetch from S3 (always, to ensure full content)
   - If NO → Use notification content (fallback)
   ↓
6. Parse email from S3 content (includes all attachments)
   ↓
7. Store in database and trigger webhooks
```

## Benefits

✅ **Guaranteed processing**: All emails processed, even > 150 KB
✅ **Full attachments**: Always get complete email with attachments
✅ **Reliable**: Works even if SNS notification is incomplete
✅ **Flexible**: Falls back to notification content if S3 unavailable
✅ **Recoverable**: Raw MIME is stored in webhook payload for downstream recovery

## Object Key Construction

The service constructs S3 object keys using this logic:

1. **If `objectKey` in notification**: Use it directly
2. **If `objectKeyPrefix` + `messageId`**: Construct as `{prefix}{messageId}`
3. **If only `messageId`**: Use `messageId` as key (try common patterns)

**Example**:

- Prefix: `forwards/`
- MessageId: `izwvg1ib@frv63.fwdcdn.com`
- Constructed key: `forwards/izwvg1ib@frv63.fwdcdn.com`

**Note**: AWS SES typically stores emails as `{prefix}{messageId}`, but the exact format may vary. The service tries multiple patterns.

## Troubleshooting

### Issue: S3 fetch fails with "NoSuchKey"

**Cause**: Object key construction is incorrect

**Solution**:

1. Check S3 bucket to see actual object key format
2. Verify `AWS_SES_S3_OBJECT_KEY_PREFIX` matches SES rule prefix
3. Check logs for constructed object key
4. Manually process using correct key: `POST /email/inbound/s3`

### Issue: Service uses notification content instead of S3

**Check logs**:

```bash
docker logs notifications-microservice-blue | grep -E 'PARSE.*S3|Fetching email from S3'
```

**Possible causes**:

- `AWS_SES_S3_BUCKET` not configured
- S3 bucket not in notification
- Email is small (< 100 KB) and content is in notification

**Solution**: Configure `AWS_SES_S3_BUCKET` in `.env` to force S3 fetching

### Issue: Duplicate processing

The service checks for existing emails by messageId to prevent duplicates. If duplicates occur:

- Check database for existing email
- Service should skip if email already exists

## Comparison: S3-First vs Notification-Only

| Aspect | Notification-Only | S3-First Strategy |
| ------ | ---------------- | ----------------- |
| Small emails (< 100 KB) | ✅ Fast (uses notification) | ✅ Fast (uses notification) |
| Large emails (> 150 KB) | ❌ May fail (no content) | ✅ Always works (fetches from S3) |
| Attachments | ⚠️ May be missing | ✅ Always included |
| Reliability | ⚠️ Depends on SNS | ✅ Works even if SNS fails |
| Configuration | Simple | Requires S3 bucket config |

## Best Practice

**Recommended configuration**:

1. ✅ Configure both S3 and SNS actions in SES
2. ✅ Set `AWS_SES_S3_BUCKET` and `AWS_SES_S3_OBJECT_KEY_PREFIX` in `.env`
3. ✅ Service will automatically use S3-first strategy
4. ✅ All emails processed reliably, regardless of size

This ensures **zero email loss** and **complete attachment processing**.
