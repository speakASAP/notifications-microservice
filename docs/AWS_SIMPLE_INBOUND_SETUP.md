# Simplest AWS setup: *@speakasap.com → spam filter → notifications-microservice → helpdesk

One path only. No extra actions.

---

## Flow

```
Inbound to *@speakasap.com
    → SES receipt rule
    → 1) Lambda (spam filter: drop if spam/virus/SPF/DKIM FAIL)
    → 2) Save to S3
    → S3 event fires
    → SNS topic
    → POST https://notifications.statex.cz/email/inbound/s3
    → notifications-microservice stores & delivers to helpdesk
```

---

## What to configure on AWS

### 1. SES receipt rule (Configuration → Email receiving → rule set → your rule)

**Actions, in this order:**

| Order | Action | Settings |
|-------|--------|----------|
| 1 | **Invoke AWS Lambda function** | Function: `ses-inbound-drop-spam`, Invocation: **RequestResponse** |
| 2 | **Deliver to Amazon S3 bucket** | Bucket: `speakasap-email-forward`, Object key prefix: `forwards/` |

**Remove** the third action **“Publish to Amazon SNS topic”** from the SES rule.  
Processing is driven only by **S3 event** (step 2 below). The SES “Publish to SNS” payload is not used by notifications-microservice and can be removed to keep one path.

**Rule settings:** enable **Spam and virus scanning** (needed for the Lambda verdicts).

---

### 2. S3 bucket event notification (this is what triggers the service)

- **Bucket:** `speakasap-email-forward`
- **Properties** → **Event notifications** → **Create event notification**
  - **Name:** e.g. `NotifyInboundEmail`
  - **Prefix:** `forwards/`
  - **Event types:** `s3:ObjectCreated:Put` (and optionally `s3:ObjectCreated:CompleteMultipartUpload`)
  - **Destination:** **SNS topic** → choose one topic (e.g. create `s3-email-events` or use existing `s3-email-events-new`)

So: when SES saves an email to `forwards/`, S3 sends an event to that SNS topic.

---

### 3. SNS topic subscription (so the service receives the event)

- **SNS** → **Topics** → select the topic used in step 2 (e.g. `s3-email-events` or `s3-email-events-new`)
- **Create subscription**
  - **Protocol:** HTTPS
  - **Endpoint:** `https://notifications.statex.cz/email/inbound/s3`
  - **Enable raw message delivery:** **Yes** (recommended for S3 events)
- Confirm the subscription (the service confirms automatically when it receives the request; check status **Confirmed**)

---

## Checklist

| Step | Where | What |
|------|--------|------|
| 1 | SES → Email receiving → your rule | Actions: (1) Lambda `ses-inbound-drop-spam`, (2) Deliver to S3. **No** “Publish to SNS” in the rule. Spam and virus scanning **Enabled**. |
| 2 | S3 → bucket `speakasap-email-forward` → Properties → Event notifications | One event: prefix `forwards/`, ObjectCreated, destination = your SNS topic. |
| 3 | SNS → your topic → Subscriptions | One HTTPS subscription to `https://notifications.statex.cz/email/inbound/s3`, status **Confirmed**. |

Result: all *@speakasap.com → spam filter → S3 → S3 event → SNS → notifications-microservice → helpdesk. No other AWS changes needed for this flow.
