# Fix: Duplicate / Triplicate Helpdesk Tickets

## Root cause

The same inbound email was triggering **multiple webhook deliveries** to the helpdesk, so one email produced 2–3 tickets.

1. **SES + S3 double delivery**  
   - SES sends a notification to `POST /email/inbound` → email stored → `processInboundEmail` → **webhook 1**.  
   - S3 event calls `POST /email/inbound/s3` → same email found by `messageId` → email **updated** → `processInboundEmail` was called again → **webhook 2** (duplicate).

2. **S3 + SES double delivery**  
   - If S3 ran first: new email stored and webhook sent.  
   - SES then ran: new email stored again (no dedupe) and webhook sent again.

3. **Reparse**  
   - Re-parsing an email called `deliverToSubscriptions` again → extra webhook and duplicate ticket.

## Changes in notifications-microservice

### 1. S3: do not send webhook when updating existing email

**File**: `src/email/inbound-email.service.ts` – `processEmailContentFromRaw`

- When an email already exists (by `messageId` or S3 key), we only **update** the stored email (body, attachments, subject).
- We **no longer** call `processInboundEmail()` in this path, so no second webhook is sent.
- Log: `"Email already exists with ID: ..., updating content only (no webhook)"`.

### 2. SES: deduplicate by `messageId` before store/process

**File**: `src/email/inbound-email.service.ts` – `handleSESNotification`

- Before `parseEmailContent` / `storeInboundEmail` / `processInboundEmail`, we check if an inbound email with this `rawData.mail.messageId` already exists.
- Query: `rawData->'mail'->>'messageId' = :messageId`.
- If a row exists → **skip** store and `processInboundEmail` (no webhook).  
  Log: `"Email with messageId ... already exists (ID: ...), skipping store and webhook to avoid duplicate tickets"`.

### 3. Reparse: do not send webhook again

**File**: `src/email/inbound-email.service.ts` – `reparseEmailFromRawData`

- After re-parsing and saving the updated email, we **no longer** call `deliverToSubscriptions()`.
- Reparse is only for fixing body/attachments in our DB; the ticket was already created on first delivery.
- Log: `"Skipping webhook delivery (email already delivered; would create duplicate tickets)"`.

## Result

- Each logical inbound email is stored at most once and triggers **at most one** webhook to the helpdesk.
- 1 email → 1 helpdesk ticket, even when both SES and S3 events are received and when reparse is used.

## Subject encoding (Mojibake) fix

Duplicate tickets sometimes had different subjects: one correct (e.g. "Napływ Klientów ze strony") and one broken (e.g. "NapÅyw KlientÃ³w ze strony"). The broken one came from the **S3 path**, where the subject is taken from raw MIME headers and decoded with `decodeHeader`.

**Cause:** In RFC 2047 quoted-printable (Q) decoding, the decoded segment is a string of byte values (code points 0–255). The code was doing `Buffer.from(decodedText, charset)` instead of `Buffer.from(decodedText, 'latin1')`, so bytes were misinterpreted and UTF-8 (e.g. Polish ł, ó) turned into Mojibake.

**Change:** In `decodeHeader`, for the Q branch we now build the buffer from raw bytes with `Buffer.from(decodedText, 'latin1')`, then decode with the header charset: `buffer.toString(charsetLower || 'utf-8')`. The existing fallback for non–RFC-2047 headers (latin1 → UTF-8) was already correct and is unchanged.

After this fix, subjects from the S3 path should match those from the SES path (e.g. "Napływ Klientów ze strony").

## Duplicate helpdesk subscriptions and delivery confirmation (Feb 2026)

Two additional causes of duplicate tickets were identified:

1. **Multiple helpdesk webhook subscriptions**  
   If notifications-microservice has two (or more) active subscriptions with `serviceName: 'helpdesk'` (e.g. one URL for `/api/email/inbound/` and one for `/api/email/webhook/`), each inbound email is delivered to each subscription → 2+ webhooks per email → 2+ Celery tasks → duplicate tickets or duplicate processing.  
   **Action:** Keep only one active helpdesk subscription. Check with `GET /webhooks/subscriptions` and remove duplicates (or use speakasap-portal’s `python manage.py check_webhook_subscriptions`).

2. **Delivery confirmation not received**  
   After the helpdesk creates a ticket it must call `POST /email/inbound/delivery-confirmation` so notifications-microservice marks the webhook_delivery as `delivered`. If this fails (timeout, wrong NOTIFICATION_SERVICE_URL, or Celery task crash before `finally`), the email stays “undelivered”. Then `GET /email/inbound` (used by poll_new_emails) still returns it → the same email is queued again every poll cycle → duplicate processing and, when listOnly returned a synthetic `messageId: inbound-{id}`, the poll idempotency check did not match webhook-created tickets → duplicate tickets.  
   **Action:** Ensure NOTIFICATION_SERVICE_URL from speakasap-portal reaches notifications-microservice; check helpdesk/Celery logs for “Failed to confirm delivery”. List undelivered: `./scripts/check-undelivered-to-helpdesk.sh` (on prod: `ssh statex 'cd ~/notifications-microservice && ./scripts/check-undelivered-to-helpdesk.sh'`).

### listOnly messageId fix (notifications-microservice)

`findInboundEmails` with `listOnly: true` now returns the real `messageId` from `rawData.mail.messageId` (when present) instead of a synthetic `inbound-{email.id}`. That allows the helpdesk poll idempotency check (by message_id) to match tickets already created by webhook, so the same email is not re-queued and duplicate tickets from poll are avoided.

### Poll confirms delivery when skipping (speakasap-portal, Feb 2026)

When `poll_new_emails` skips an email because a ticket or comment with the same `message_id` already exists, it now calls the delivery-confirmation endpoint so the email is marked as delivered. Otherwise the email would keep appearing in `GET /email/inbound` every poll cycle. The confirmation URL uses the same `NOTIFICATION_SERVICE_URL` fallback (settings + env) as the rest of the helpdesk tasks.

## Deployment

Redeploy notifications-microservice after pulling these changes. No DB migrations or config changes are required.
