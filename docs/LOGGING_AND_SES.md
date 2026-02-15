# Logging and SES Verification

## 1. Central logging (logging-microservice)

### Fix: No logs from notifications-microservice in logging-microservice

**Cause:** Wrong `LOGGING_SERVICE_URL` in production `.env`:

- **Port:** Logging backend listens on **3367**. Other services (auth-microservice, payments-microservice, etc.) use `http://logging-microservice:3367` so the logging port is always the same regardless of blue/green.
- **Hostname:** Use **logging-microservice** (stable name, not tied to blue/green); same as other services.

**Codebase (aligned with other services):**

- `.env.example`: Documented correct URL; `LOGGING_SERVICE_PORT` optional (default 3367).
- `docker-compose.blue.yml` / `docker-compose.green.yml`: Default `LOGGING_SERVICE_URL` is `http://logging-microservice:${LOGGING_SERVICE_PORT:-3367}` (same as auth-microservice, payments-microservice).

**Production .env change (do on server after backup):**

1. Backup: `cp .env .env.bak.$(date +%Y%m%d_%H%M%S)`
2. Set the correct URL (port **3367**; hostname **logging-microservice**):

```bash
LOGGING_SERVICE_URL=http://logging-microservice:3367
```

1. Restart notifications-microservice (blue/green) so the new env is picked up.
2. Confirm: open <https://logging.statex.cz/admin/>, query service `notifications-microservice`; logs should appear after the next requests.

---

## 2. How SES confirms it received and sent an email

- **On send:** The app uses the AWS SDK (`SendEmailCommand` or `SendRawEmailCommand`). When SES accepts the request, it returns a **MessageId** in the response. The app logs it, e.g.:
  - `Email sent successfully via AWS SES to <recipient>, messageId: <id>`
  - `Raw email sent successfully via AWS SES to <recipient>, messageId: <id>`
- So **SES “received”** = we got a successful response with `MessageId` from the SDK. **SES “sent”** (handed off to the recipient’s mail system) is not confirmed by the API; you rely on **Sending statistics** and optional **event publishing** (see below).

**To be sure sending to SES is configured correctly:**

1. **Credentials and region:** `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_SES_REGION` (e.g. `eu-central-1`) must be set and correct.
2. **From address:** `AWS_SES_FROM_EMAIL` must be verified in SES (or the account must be out of sandbox with a verified domain).
3. **Logs:** After a send, check app logs for the “Email sent successfully via AWS SES … messageId: …” line. If that appears, SES accepted the message.
4. **AWS Console:** In SES → Account dashboard, “Sending statistics” and “Reputation” show send volume and bounces/complaints (see section 3).

---

## 3. Where to check sent emails in AWS SES

SES does **not** provide a “list of every sent email” in the console. You can only:

### A. Sending statistics (overview)

1. **AWS Console** → **Amazon Simple Email Service (SES)**.
2. In the left menu: **Account dashboard** (or **Sending statistics** in some regions).
3. You see:
   - **Sending** (e.g. 24h / 14 days): number of send attempts.
   - **Bounces / Complaints**: delivery failures and abuse reports.

### B. Configuration sets and event destinations (optional)

- **Configuration sets** → **Create configuration set** or use an existing one.
- Add **Event destinations** (e.g. SNS topic, CloudWatch) for events: **Send**, **Delivery**, **Bounce**, **Complaint**.
- Then you can see per-message delivery/bounce in SNS or CloudWatch, but this requires setup; it is not a built-in “sent emails” list.

### C. Our app logs and DB

- **Logs:** Search for `Email sent successfully via AWS SES` and `messageId:` (local logs or central logging-microservice after the URL fix).
- **DB:** Table `notifications` stores outbound sends (id, status, recipient, etc.); table `inbound_emails` stores received/forwarded inbound.

**Summary:** For “did we send this?” use app logs (and DB). For “how is SES doing overall?” use SES → Account dashboard / Sending statistics.
