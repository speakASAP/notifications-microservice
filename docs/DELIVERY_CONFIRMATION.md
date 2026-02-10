# Helpdesk Delivery Confirmation (Guaranteed Delivery Tracking)

## Overview

Inbound emails are delivered to the helpdesk (and other subscribers) via webhook. Previously we only knew that the HTTP POST returned 200; the helpdesk processes the email asynchronously (Celery), so the ticket might not be created yet or could fail later.

We now track **per-email, per-subscription** delivery and allow the helpdesk to **confirm delivery** when a ticket or comment is actually created. This gives:

- **Guaranteed delivery visibility**: See which emails were sent to helpdesk but not yet confirmed.
- **Confirmation of delivery**: Helpdesk calls back when the ticket/comment is created.

## Flow

1. Notifications-microservice receives an inbound email (SES/S3), stores it in `inbound_emails`, then calls `deliverToSubscriptions()`.
2. For each active subscription (e.g. helpdesk), it POSTs the email payload to the webhook URL. The payload **includes `subscriptionId`** and the email **`id`** (inboundEmailId).
3. After a successful HTTP 200, a row is created in **`webhook_deliveries`** with `status = 'sent'`.
4. Helpdesk queues the email for async processing (Celery). When the task **successfully** creates a ticket or comment, it calls:
   `POST {NOTIFICATION_SERVICE_URL}/email/inbound/delivery-confirmation`
   with `{ inboundEmailId, subscriptionId, status: 'delivered', ticketId, commentId? }`.
5. Notifications-microservice updates the corresponding `webhook_deliveries` row to `status = 'delivered'`, sets `delivered_at`, `ticket_id`, `comment_id`.

## API

### POST /email/inbound/delivery-confirmation

Called by the helpdesk (or other subscriber) after successfully creating a ticket/comment.

**Body:**

```json
{
  "inboundEmailId": "uuid-of-inbound-email",
  "subscriptionId": "uuid-of-webhook-subscription",
  "status": "delivered",
  "ticketId": "123",
  "commentId": "456",
  "error": null
}
```

- `status`: `"delivered"` or `"failed"`.
- `ticketId`, `commentId`: optional; required for `delivered` to link to helpdesk ticket/comment.
- `error`: optional; used when `status` is `"failed"`.

### GET /email/inbound/undelivered?limit=100

Returns webhook deliveries that were **sent** to the helpdesk but not yet **confirmed** (status still `sent`). Useful for monitoring and identifying emails that never made it into a ticket.

## Database

- **`webhook_deliveries`**: One row per (inbound_email_id, subscription_id) when we send the webhook. Columns: `status` (sent | delivered | failed), `http_status`, `delivered_at`, `ticket_id`, `comment_id`, `error`, timestamps.
- Migrations run automatically at app startup (no separate deploy step). To run manually: `npm run migration:run`.

## Script

- **`scripts/check-undelivered-to-helpdesk.sh`** – Lists undelivered (sent but not confirmed) to helpdesk via API or direct DB query. Run on prod: `ssh statex 'cd ~/notifications-microservice && ./scripts/check-undelivered-to-helpdesk.sh'`

## Helpdesk (speakasap-portal)

- Webhook payload now includes `data.id` (inboundEmailId) and `data.subscriptionId`. The async task `process_inbound_email_async` passes `email_data` (including these) to the processor; after success it calls the delivery-confirmation endpoint.
- Uses `NOTIFICATION_SERVICE_URL` and `NOTIFICATION_SERVICE_TIMEOUT` from Django settings (see portal `local_settings` / `.env`).
