# Raw Message Delivery Implementation

## Summary

The codebase has been updated to support **raw message delivery** for AWS SES notifications. This ensures we receive the original message directly from AWS without any transformations, reducing the risk of data loss.

## Changes Made

### 1. Controller Updates (`inbound-email.controller.ts`)

- **Added raw delivery detection**: Checks `x-amz-sns-rawdelivery` header to determine message format
- **Dual format support**: Handles both raw (direct SES notification) and wrapped (SNS envelope) formats
- **Automatic routing**: Routes to appropriate handler based on delivery format

### 2. Service Updates (`inbound-email.service.ts`)

- **New method**: `handleSESNotification()` - Processes SES notification directly (raw format)
- **Refactored method**: `handleSNSNotification()` - Processes wrapped SNS message format
- **Unified processing**: Both methods converge to the same email processing logic
- **Enhanced interface**: `SESNotification` interface updated to include all fields from raw SES notifications

## Benefits

1. **No Data Loss**: Original message received directly without transformations
2. **Simpler Processing**: No need to extract from `Message` field and parse JSON string
3. **Backward Compatible**: Still supports wrapped format for existing subscriptions
4. **Full Control**: We parse the message on our side, not AWS

## How It Works

### Raw Message Delivery (Recommended)

```text
AWS SES → SNS (raw delivery enabled) → notifications-microservice
  ↓
Body = SES notification directly
  ↓
Controller detects x-amz-sns-rawdelivery: true
  ↓
Calls handleSESNotification(body) directly
  ↓
Process email
```

### Wrapped Format (Legacy)

```text
AWS SES → SNS (raw delivery disabled) → notifications-microservice
  ↓
Body = SNS wrapper { Type: "Notification", Message: "{...SES notification...}" }
  ↓
Controller detects no raw delivery header
  ↓
Calls handleSNSNotification(body)
  ↓
Extracts SES notification from Message field
  ↓
Calls handleSESNotification(parsed notification)
  ↓
Process email
```

## Configuration

### Enable Raw Message Delivery

1. Go to AWS SNS Console → Subscriptions
2. Select your subscription for SES notifications
3. Edit subscription attributes
4. Set `RawMessageDelivery` to `true`
5. Save changes

Or via AWS CLI:

```bash
aws sns set-subscription-attributes \
  --subscription-arn "arn:aws:sns:eu-central-1:781206275849:inbound-email-speakasap:cc0b554b-d211-41f5-b96f-63e043a4c540" \
  --attribute-name RawMessageDelivery \
  --attribute-value true \
  --region eu-central-1
```

### Verify Configuration

```bash
aws sns get-subscription-attributes \
  --subscription-arn "<YOUR_SUBSCRIPTION_ARN>" \
  --region eu-central-1
```

Look for `RawMessageDelivery` attribute - should be `"true"` for raw delivery.

## Testing

After enabling raw message delivery:

1. Send a test email to `stashok@speakasap.com`
2. Check logs for `[CONTROLLER] Raw message delivery: true`
3. Verify email is processed and stored in database
4. Check helpdesk receives the email

## Migration

**No migration needed!** The code supports both formats automatically:

- Existing subscriptions with raw delivery disabled will continue to work
- New subscriptions can use raw delivery enabled
- The code automatically detects and handles both formats

## Rollback

If you need to disable raw message delivery:

1. Set `RawMessageDelivery` to `false` in SNS subscription
2. The code will automatically switch to wrapped format handling
3. No code changes needed

## References

- [AWS SNS Raw Message Delivery](https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html)
- [AWS SES Notification Contents](https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html)
