# SES SNS vs S3 event SNS – what notifications-microservice uses

## Your current AWS setup (from screenshots)

1. **SES receipt rule "default"** (Configuration → Email receiving) has **3 actions** in order:
   - **1. Invoke Lambda** `ses-inbound-drop-spam` (RequestResponse) ✅
   - **2. Deliver to S3** bucket `speakasap-email-forward`, prefix `forwards/` ✅
   - **3. Publish to Amazon SNS topic** `arn:aws:sns:eu-central-1:781206275849:s3-email-events-new` ✅

2. So you **do** use an SNS topic in the SES rule: **`s3-email-events-new`**.

## Two different payloads

| Source | When it runs | Payload shape | What notifications-microservice does |
|--------|----------------|---------------|--------------------------------------|
| **SES rule action 3** “Publish to SNS” | When SES receives an email (after Lambda + S3) | **SES notification**: `mail`, `receipt`, optional content. **No** `Records[].s3.bucket` / `Records[].s3.object`. | **`/email/inbound/s3`** expects S3-style `Records` or `{ bucket, key }`. It does **not** parse SES notification format here → falls through to “Missing bucket/key” → **email not processed** from this path. |
| **S3 bucket event notification** | When an object is **created** in the bucket (e.g. in `forwards/`) | **S3 event**: `Records[]` with `eventSource: "aws:s3"`, `s3.bucket.name`, `s3.object.key`. | **`/email/inbound/s3`** matches `body.Records` with `s3` → calls `processEmailFromS3(bucket, key)` → **email processed** ✅ |

So:

- **SES** “Publish to SNS” sends **SES** payloads to `s3-email-events-new`.
- **notifications-microservice** only **processes** requests that contain **S3 event** payloads (or manual `bucket`/`key`) at **`/email/inbound/s3`**.

Therefore: **the service does not effectively use the SES → SNS payload** for processing. It only processes when it receives **S3 event** payloads.

## What must be configured for emails to reach helpdesk

1. **S3 bucket** `speakasap-email-forward` must have **Event notifications** (S3 Console → bucket → Properties → Event notifications):
   - Event types: e.g. **s3:ObjectCreated:Put** (and optionally CompleteMultipartUpload).
   - Prefix: **`forwards/`** (same as SES object key prefix).
   - Destination: an **SNS topic** (can be the same `s3-email-events-new` or a different one).

2. That **SNS topic** (the one used by S3) must have an **HTTPS subscription**:
   - Endpoint: **`https://notifications.statex.cz/email/inbound/s3`**
   - Status: **Confirmed**.

Then:

- SES receives mail → Lambda (CONTINUE) → S3 (saves to `forwards/`) → **S3** fires event → SNS → **notifications-microservice** gets **S3** payload → processes and delivers to helpdesk.

The **SES** “Publish to SNS” (action 3) still runs and sends **SES** notifications to the same topic; the service will receive those too but will **not** process them (wrong payload shape). Only the **S3 event** messages trigger processing.

## Quick check

- **S3 Console** → bucket **speakasap-email-forward** → **Properties** → **Event notifications**: confirm there is an event for prefix `forwards/` and destination = your SNS topic (e.g. `s3-email-events-new`).
- **SNS Console** → topic (e.g. **s3-email-events-new**) → **Subscriptions**: confirm an HTTPS subscription to **`https://notifications.statex.cz/email/inbound/s3`** with status **Confirmed**.

If S3 event notification is missing or points to a topic that has no subscription to `/email/inbound/s3`, inbound emails will be stored in S3 but **not** processed by notifications-microservice (and will not reach the helpdesk).

## Summary

- You **do** use an SNS topic in the **SES** rule (`s3-email-events-new`).
- **notifications-microservice** does **not** use the **SES** notification content for processing; it only processes **S3 event** payloads at `/email/inbound/s3`.
- So you must have **S3 bucket event notification** → SNS → **HTTPS to `/email/inbound/s3`** for emails to be processed and to appear in the helpdesk.
