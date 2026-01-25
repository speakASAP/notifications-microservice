# AWS SNS Raw Message Delivery: Why "No" for SES Notifications

## Overview

This document explains why **"Enable raw message delivery"** should be set to **"No"** for AWS SES email receiving notifications, and the difference between raw and non-raw message delivery formats.

## Two Different Message Formats

### 1. Raw Message Delivery = **NO** (Default for SES Notifications)

When raw message delivery is **disabled**, AWS SNS wraps the message in a JSON envelope:

```json
{
  "Type": "Notification",
  "MessageId": "20aa44af-e5fe-5476-9190-255f9a9d8446",
  "TopicArn": "arn:aws:sns:eu-central-1:781206275849:inbound-email-speakasap",
  "Message": "{\"notificationType\":\"Received\",\"mail\":{...},\"receipt\":{...},\"content\":\"...\"}",
  "Timestamp": "2026-01-25T20:29:24.123Z",
  "SignatureVersion": "1",
  "Signature": "...",
  "SigningCertURL": "..."
}
```

**Key points:**

- The actual SES notification is in the `Message` field as a **JSON string**
- The code expects this format and does: `JSON.parse(snsMessage.Message)` to extract the SES notification
- This is the **standard format** for SES notifications via SNS

### 2. Raw Message Delivery = **YES** (For S3 Events)

When raw message delivery is **enabled**, SNS sends the message directly without the wrapper:

```json
{
  "notificationType": "Received",
  "mail": {...},
  "receipt": {...},
  "content": "..."
}
```

**Key points:**

- No SNS wrapper - the body IS the message
- Used for S3 event notifications where we want the S3 event JSON directly
- The code would need to handle this format differently (which it does for `/email/inbound/s3` endpoint)

## Why "No" for SES Notifications?

### 1. **Code Design**

The current code in `inbound-email.service.ts` is designed to handle the wrapped format:

```typescript
// Line 130 in inbound-email.service.ts
const sesNotification: SESNotification = JSON.parse(snsMessage.Message);
```

This code expects:

- `snsMessage` to have a `Message` field (from SNS wrapper)
- `Message` to be a JSON string containing the SES notification
- It then parses that string to get the actual SES notification

If raw delivery is enabled, `snsMessage.Message` would be `undefined`, and the code would fail.

### 2. **SNS Metadata**

The SNS wrapper provides important metadata:

- `MessageId`: Unique identifier for the SNS message
- `TopicArn`: Which SNS topic sent the message
- `Timestamp`: When SNS received the message
- `Signature`: For message verification (optional but recommended)

### 3. **Consistency**

SES notifications are always published in a specific JSON structure. The SNS wrapper provides a consistent way to:

- Identify the message type (`Type: "Notification"` vs `Type: "SubscriptionConfirmation"`)
- Extract the actual SES notification from the `Message` field
- Handle subscription confirmations separately

## Current Implementation

The code now supports **both formats automatically**:

### Raw Message Delivery (Recommended)

When `x-amz-sns-rawdelivery: true` header is present:

1. Body is the SES notification directly (no wrapper)
2. Controller detects raw delivery from header
3. Calls `handleSESNotification()` directly with the body
4. No JSON parsing needed - original message preserved

### Wrapped Format (Legacy Support)

When raw delivery is disabled:

1. Body has SNS wrapper with `Message` field
2. Controller extracts SES notification from `Message` field
3. Calls `handleSNSNotification()` which parses `Message` field
4. Then calls `handleSESNotification()` with parsed notification

Both paths converge to the same `handleSESNotification()` method, ensuring consistent processing regardless of delivery format.

## Why Raw Delivery Might Appear Enabled

If you see `"x-amz-sns-rawdelivery":"true"` in the headers but the body still has the SNS wrapper, this could mean:

1. **The header is misleading**: The header might be set even when raw delivery is disabled
2. **The middleware is working**: The middleware might be parsing the body correctly regardless
3. **Configuration mismatch**: The subscription might have been created with raw delivery enabled, but the code is still handling it

## Recommendation

**For SES email receiving notifications:**

- ✅ **Enable raw message delivery: YES (Recommended)**
- **Benefits:**
  - Original message received directly without any transformation
  - No risk of data loss from double JSON parsing
  - Simpler processing - no need to extract from `Message` field
  - Full control over message parsing on our side
- The code now supports **both formats** (raw and wrapped) automatically
- Raw delivery is detected from `x-amz-sns-rawdelivery` header
- If raw delivery is disabled, the code still works with wrapped format

**For S3 event notifications:**

- ✅ **Enable raw message delivery: YES**
- This sends the S3 event JSON directly
- The `/email/inbound/s3` endpoint handles this format
- No SNS wrapper needed for S3 events

## Verification

To verify your subscription configuration:

```bash
aws sns get-subscription-attributes \
  --subscription-arn "arn:aws:sns:eu-central-1:781206275849:inbound-email-speakasap:cc0b554b-d211-41f5-b96f-63e043a4c540" \
  --region eu-central-1
```

Look for `RawMessageDelivery` attribute:

- Should be `"false"` for SES notifications
- Should be `"true"` for S3 events

## Troubleshooting

If emails are not being processed:

1. **Check subscription attributes:**

   ```bash
   aws sns get-subscription-attributes --subscription-arn <ARN> --region eu-central-1
   ```

2. **Verify RawMessageDelivery is "false"** for SES notifications

3. **Check logs** for parsing errors:

   ```bash
   docker logs notifications-microservice-blue | grep -i "parse\|message"
   ```

4. **Test with a subscription confirmation** to verify the endpoint is working

## References

- [AWS SNS Message Formats](https://docs.aws.amazon.com/sns/latest/dg/sns-message-and-json-formats.html)
- [AWS SNS Raw Message Delivery](https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html)
- [AWS SES Notification Contents](https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html)
