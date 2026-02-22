# SPAM Reporting and Filtering for Inbound Email

## Your questions

1. **How can we report SPAM** so it improves spam filters and reduces emails we receive from S3?
2. **Will it reduce costs** if fewer emails are sent to us?

---

## Short answers

- **Reporting SPAM**: You have two main levers:
  - **Use AWS SES built-in spam verdict** (recommended, no “report” UI): Add a Lambda in the SES receipt rule that drops mail when `spamVerdict` (or virus/spf/dkim) is FAIL **before** the “Save to S3” action. That reduces spam reaching S3 and this service.
  - **User “Report spam”**: Add a “mark as spam” flow (e.g. from helpdesk) that records sender/domain in a blocklist; use that list to filter future inbound (e.g. skip delivery to helpdesk or, with Lambda, drop at SES before S3).
- **Cost**: **Yes.** Fewer emails reaching S3 means less S3 storage, fewer S3 GETs (when we process), fewer S3→webhook→helpdesk flows, and fewer tickets. So less spam directly reduces cost.

---

## 1. Where spam can be reduced

Current flow:

- **SES** receives mail → **S3** (save) + **SNS** (notify) → our **POST /email/inbound/s3** processes the object and delivers to helpdesk.
- We do **not** process the classic SES SNS notification (POST /email/inbound is ignored in S3-only mode), so we never see `spamVerdict` in this service. Spam reduction can still happen in two places:
  1. **In AWS (before S3)** – receipt rule + Lambda that drops mail (e.g. on spam/virus verdict). Best for cost and volume.
  2. **In our app** – after we have the email (e.g. “report spam” → blocklist; then filter delivery or, with Lambda, block at SES).

---

## 2. Option A: Use SES spam verdict (recommended first step)

**Idea:** Run a Lambda **before** the “Save to S3” action in the SES receipt rule. If Lambda sees `spamVerdict.status === 'FAIL'` (and optionally virus/spf/dkim FAIL), return `disposition: 'STOP_RULE_SET'`. SES then stops the rule set and does **not** save to S3 and does **not** publish to SNS. We never receive those emails.

**Effects:**

- Improves “spam filtering” by actually dropping SES-flagged spam before it hits S3.
- Reduces: S3 storage, S3 GETs, webhook calls, helpdesk tickets → **reduces cost**.
- No change required in notifications-microservice code; configuration is in **AWS Console** (SES receipt rules + Lambda).

**Steps (high level):**

1. In **SES** → Receipt rules → your rule set → your rule that currently has “Save to S3” (and possibly “Publish to SNS”).
2. Add an action **before** S3: **Invoke Lambda** (synchronous, RequestResponse).
3. Lambda receives the SES event (including `receipt.spamVerdict`, `virusVerdict`, etc.). If any verdict is FAIL, return `{ disposition: 'STOP_RULE_SET' }`; otherwise `{ disposition: 'CONTINUE' }`.
4. Ensure the Lambda action is ordered **before** the S3 (and SNS) actions.

**Step-by-step AWS Console guide:** [SPAM_VERDICT_AWS_CONSOLE_STEPS.md](SPAM_VERDICT_AWS_CONSOLE_STEPS.md) — which menu to click and how to implement the Lambda + receipt rule.

References:

- [Lambda function examples (SES)](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-lambda-example-functions.html) (includes spam/virus filtering with `STOP_RULE_SET`).
- [Invoke Lambda function action](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-lambda.html).

**Note:** This does not add a “report spam” button; it uses SES’s own verdict to reduce spam and cost.

---

## 3. Option B: “Report spam” from helpdesk / app

**Idea:** User marks a message as spam → we record sender (or domain) in a blocklist → we use that to:

- **Option B1 – Filter in this service:** When delivering to helpdesk, skip emails whose sender/domain is in the blocklist (we still fetched from S3 and stored in `inbound_emails`; we just don’t create a ticket). Reduces helpdesk noise and some downstream cost, but we still pay for S3 storage and processing for that email.
- **Option B2 – Block at SES (advanced):** A Lambda in the receipt rule calls an API (e.g. from this service) or reads a shared store to check the blocklist and returns `STOP_RULE_SET` for known spammers. Then those emails never hit S3 → maximum cost and volume reduction.

**Implementation outline (if we add it):**

- New endpoint, e.g. `POST /email/inbound/:id/report-spam` (and/or support from helpdesk callback), that:
  - Loads the inbound email by `id`, extracts `from` (and optionally domain).
  - Stores “spam reporter” in DB (e.g. new table or column: `spam_reported_from`, `spam_reported_domain`, `reported_at`).
- When processing inbound (or when delivering to helpdesk), check blocklist and either skip webhook delivery (B1) or expose an API for Lambda to call (B2).
- **AWS:** There is no SES API to “report this inbound as spam” to improve SES’s own filters. The account-level suppression list is for **outbound** (bounces/complaints). So “report spam” only improves **our** blocklist, not AWS’s global spam model.

---

## 4. Cost impact (summary)

| What we reduce              | Effect |
|----------------------------|--------|
| Emails saved to S3         | Less S3 storage, fewer S3 PUTs (SES side). |
| Emails we process (GET S3) | Fewer S3 GETs, less CPU and webhook traffic. |
| Emails delivered to helpdesk | Fewer tickets and less noise. |

So: **yes, fewer emails (less spam) will reduce costs.** The biggest gain is from dropping spam **before** S3 (Option A). Option B1 still saves S3 cost for that one email but reduces helpdesk load; Option B2 can avoid S3 and processing entirely for blocklisted senders.

---

## 5. Recommendation

1. **First:** Configure **Option A** in AWS (Lambda in receipt rule using `spamVerdict`/virus/spf/dkim before S3). No code changes in notifications-microservice; improves filters and reduces cost quickly.
2. **If you still want a “Report spam” button:** Add **Option B1** (blocklist in DB + skip delivery to helpdesk for reported senders/domains). Option B2 (Lambda + blocklist API) is optional if you need to block at SES and avoid S3 entirely for known spammers.

---

## 6. What we do *not* have today

- No use of `spamVerdict` in this codebase (S3-only flow; we don’t receive the SES receipt in the service).
- No “report spam” endpoint or blocklist.
- No SES API to report inbound mail as spam to AWS (only outbound suppression list exists).

All of the above can be added as described without modifying database-server, auth-microservice, nginx-microservice, or logging microservice.
