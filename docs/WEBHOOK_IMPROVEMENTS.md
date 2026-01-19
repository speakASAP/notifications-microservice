# Webhook Subscription Reliability Improvements

## Overview

This document describes the improvements made to webhook subscription reliability and auto-recovery mechanisms to prevent subscription suspensions and ensure automatic recovery from temporary failures.

## Changes Implemented

### 1. Increased Default Max Retries

**File**: `src/email/webhook-subscription.service.ts`

- Changed default `maxRetries` from 3 to 8
- Provides more resilience for temporary network/SSL issues
- Reduces false positives that cause unnecessary suspensions

### 2. Exponential Backoff

**File**: `src/email/webhook-delivery.service.ts`

- Added exponential backoff between retry attempts
- Formula: `delay = min(1000 * 2^(retryCount - 1), 30000)` milliseconds
- Maximum delay: 30 seconds
- Prevents overwhelming the target service during temporary issues

### 3. Enhanced SSL Error Handling

**File**: `src/email/webhook-delivery.service.ts`

- Detects SSL/certificate/TLS errors automatically
- Automatically increases `maxRetries` to 10 for SSL-related errors
- Provides more attempts for temporary certificate issues

### 4. Auto-Resume Suspended Subscriptions

**File**: `src/email/webhook-delivery.service.ts`

- Cron job runs every hour (`@Cron(CronExpression.EVERY_HOUR)`)
- Checks all suspended subscriptions
- Waits at least 1 hour after last error before attempting resume
- Sends test webhook to verify service availability
- Automatically reactivates subscription if test succeeds
- Resets retry count and clears error information

### 5. Health Check Verification

**File**: `src/email/webhook-delivery.service.ts`

- Checks webhook health endpoint before delivery
- Constructs health URL from webhook URL pattern
- Skips delivery if health check fails (doesn't count as failure)
- Optional feature - allows delivery if health endpoint unavailable

### 6. Improved Logging

**File**: `src/email/webhook-delivery.service.ts`

- Enhanced logging with retry attempt details: `(attempt X/Y)`
- Logs exponential backoff delays
- Logs SSL error detection and maxRetries adjustment
- Logs auto-resume attempts and results
- Logs health check results

### 7. Suspension Alerts

**File**: `src/email/webhook-delivery.service.ts`

- Logs critical alerts when subscription is suspended
- Includes subscription details and last error message
- Ready for integration with email/Telegram notification service

### 8. ScheduleModule Integration

**File**: `src/app.module.ts`

- Added `ScheduleModule.forRoot()` to enable cron jobs
- Required for auto-resume functionality

## Helpdesk Health Check Endpoint

**Files**: `helpdesk/views.py`, `helpdesk/urls.py`

- Added `WebhookHealthCheckView` class
- Endpoint: `/helpdesk/health/`
- Supports both GET and POST methods
- Returns JSON: `{status: 'ok', service: 'helpdesk', timestamp: '...'}`

## Configuration

### Default Values

- `maxRetries`: 8 (was 3)
- `AUTO_RESUME_CHECK_INTERVAL_HOURS`: 1
- Exponential backoff max delay: 30 seconds
- SSL error maxRetries: 10

### Environment Variables

No new environment variables required. All improvements use sensible defaults.

## Monitoring

### Check Subscription Status

```sql
SELECT id, status, total_failures, "retryCount", max_retries,
       "last_error", "last_error_at", "last_delivery_at"
FROM webhook_subscriptions
WHERE webhook_url LIKE '%speakasap.com%';
```

### Logs to Monitor

- `[WEBHOOK_DELIVERY] ⚠️ Suspending subscription` - Subscription suspended
- `[WEBHOOK_DELIVERY] ✅ Auto-resumed subscription` - Auto-resume successful
- `[WEBHOOK_DELIVERY] 🚨 ALERT:` - Critical suspension alert

## Testing

### Test Auto-Resume

1. Manually suspend a subscription:

   ```sql
   UPDATE webhook_subscriptions SET status = 'suspended' WHERE id = '...';
   ```

2. Wait 1+ hours

3. Check logs for auto-resume attempt

4. Verify subscription is reactivated if webhook is available

### Test Health Check

```bash
curl https://speakasap.com/helpdesk/health/
```

Expected response:

```json
{
  "status": "ok",
  "service": "helpdesk",
  "timestamp": "2026-01-16T20:00:00.000Z"
}
```

### Test Exponential Backoff

1. Temporarily break webhook endpoint
2. Send test email
3. Check logs for backoff delays: `Applying exponential backoff: Xms`

## Deployment

Changes have been committed and pushed to:

- `notifications-microservice` repository (main branch)
- `speakasap-portal` repository (release branch)

### Next Steps

1. Pull latest changes on production server
2. Rebuild and redeploy notifications-microservice
3. Restart service to enable cron jobs
4. Monitor logs for auto-resume activity

## Benefits

1. **Reduced False Suspensions**: Higher retry limit prevents temporary issues from causing suspensions
2. **Automatic Recovery**: Subscriptions automatically recover when service becomes available
3. **Better Resilience**: Exponential backoff prevents overwhelming services during outages
4. **Improved Monitoring**: Enhanced logging provides better visibility into webhook delivery
5. **Proactive Health Checks**: Health endpoint verification prevents unnecessary delivery attempts

## Future Enhancements

- [ ] Send email/Telegram notifications on suspension (currently only logged)
- [ ] Add metrics dashboard for subscription status
- [ ] Implement webhook signature verification
- [ ] Add retry queue for failed deliveries
- [ ] Add subscription status API endpoint
