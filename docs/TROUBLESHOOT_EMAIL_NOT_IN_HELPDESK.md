# Troubleshoot: Email not appearing in Helpdesk

When an inbound email (e.g. to <contact@speakasap.com>m>m><stashok@speakasap.com>com>com>) does not show up in <https://speakasap.com/helpdesk/>, use this checklist to find where the pipeline breaks.

**Pipeline:** SES → (Lambda) → S3 → **S3 event** → SNS → **notifications-microservice** `/email/inbound/s3` → store + **webhook** → **speakasap-portal** helpdesk → ticket.

**Quick trace (specific email):** Run on statex to see where it stuck (DB? helpdesk delivery? status?):

```bash
cd ~/notifications-microservice
# By Message-Id (strip angle brackets or pass as-is)
./scripts/trace-email-helpdesk.sh "1772359319.0556817000.g9aprhbf@frv63.fwdcdn.com"
# Or by from/to (last 7 days)
./scripts/trace-email-helpdesk.sh "" "lisapet@ukr.net" "contact@speakasap.com"
```

Script prints: (1) whether the email is in `inbound_emails`, (2) helpdesk `webhook_deliveries` row and status, (3) where to check logs. Then follow sections 1–2 below for details.

---

## 1. On statex (notifications-microservice): did the email reach the service?

**Connect:** `ssh statex`

**Note:** All notification API endpoints (e.g. `GET /email/inbound`, `GET /webhooks/subscriptions`, `GET /email/inbound/undelivered`) require auth. Use `Authorization: Bearer $SERVICE_TOKEN` where `SERVICE_TOKEN` is from `notifications-microservice/.env` (must match speakasap-portal `NOTIFICATION_SERVICE_AUTH_TOKEN`).

### 1.1 Is the email in the database?

```bash
cd ~/notifications-microservice
# If you have psql to the notifications DB (adjust DB name/host if needed)
docker exec -it $(docker ps -q -f name=notifications-microservice | head -1) sh -c '
  node -e "
    const { Client } = require(\"pg\");
    const c = new Client({
      host: process.env.DB_HOST || \"db-server-postgres\",
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || \"notifications\"
    });
    c.connect().then(() =>
      c.query(\"SELECT id, \\\"from\\\", \\\"to\\\", subject, status, \\\"receivedAt\\\" FROM inbound_emails ORDER BY \\\"receivedAt\\\" DESC LIMIT 20\")
    ).then(r => { console.log(JSON.stringify(r.rows, null, 2)); return c.end(); }).catch(e => { console.error(e); process.exit(1); });
  "
'
```

Or query via API (from statex; use SERVICE_TOKEN from `.env`):

```bash
source ~/notifications-microservice/.env
curl -s -H "Authorization: Bearer $SERVICE_TOKEN" \
  'https://notifications.statex.cz/email/inbound?limit=20&toFilter=@speakasap.com' | jq '.data[] | {id, from, to, subject, status, receivedAt}'
# Pending emails (e.g. bounces): add &status=pending
```

**Look for:** Your email (to <stashok@speakasap.com>, subject "Сташок тест" or similar). If it **is not** in the list:

- The email may **not have been processed** by notifications-microservice. Then either:
  - **S3 event** did not fire (check S3 bucket → Properties → Event notifications for `forwards/` prefix → SNS topic).
  - **SNS subscription** to `https://notifications.statex.cz/email/inbound/s3` is missing or not **Confirmed** (SNS Console → s3-email-events → Subscriptions).
  - The service received the request but failed (see logs below).

If the email **is** in the list, note its `id` and continue.

### 1.2 Was the webhook sent to helpdesk?

From the same DB or API, check webhook deliveries for that inbound email. Replace `INBOUND_EMAIL_ID` with the `id` from 1.1:

```bash
source ~/notifications-microservice/.env
curl -s -H "Authorization: Bearer $SERVICE_TOKEN" \
  'https://notifications.statex.cz/email/inbound/undelivered?limit=50' | jq .
```

If the email is in `inbound_emails` but **not** in undelivered and you need to confirm deliveries, query the DB for `webhook_deliveries` for that `inbound_email_id` (see 1.1). In the notifications DB:

```sql
SELECT wd.id, wd.inbound_email_id, wd.subscription_id, wd.status, wd.http_status, ws."serviceName", ws.webhook_url
FROM webhook_deliveries wd
JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
WHERE wd.inbound_email_id = 'INBOUND_EMAIL_ID';
```

**Look for:** A row with `status = 'sent'` or `'delivered'` for helpdesk. If there is **no** row for helpdesk:

- Subscription filter may not match: helpdesk subscription should have `filters.to = ["*@speakasap.com"]`. Check: `source ~/notifications-microservice/.env && curl -s -H "Authorization: Bearer $SERVICE_TOKEN" https://notifications.statex.cz/webhooks/subscriptions | jq '.[] | select(.serviceName=="helpdesk") | {id, serviceName, webhookUrl, filters, status, lastDeliveryAt}'`. If `lastDeliveryAt` is old (e.g. days ago), no successful webhook delivery since then—check central logs and helpdesk health.
- Health check may be failing (service logs).

### 1.3 Notifications-microservice logs

```bash
# On statex, follow container logs (adjust container name if needed)
docker logs -f --tail 500 $(docker ps -q -f name=notifications-microservice | head -1) 2>&1 | grep -E 'inbound|WEBHOOK_DELIVERY|8o7nele9c5j7rbdrcutg7hon7ne7ossan51d9qg1|stashok|lisapet|Сташок'
```

Or check **central logging** (e.g. <https://logging.statex.cz>) for service `notifications-microservice` and keywords: `WEBHOOK_DELIVERY`, `DELIVER TO SUBSCRIPTIONS`, `Filter check result`, `Successfully delivered`, `Exception caught`. (Detailed delivery logs are often sent only to the logging microservice, not container stdout.)

**Look for:**  

- `POST /email/inbound/s3` and `processEmailFromS3` / `Stored new email` (email reached and was stored).  
- `DELIVER TO SUBSCRIPTIONS`, `Filter check result`, `Successfully delivered to helpdesk` or `Exception caught during delivery` (webhook sent or failed).

---

## 2. On speakasap (speakasap-portal): did the helpdesk receive and process the webhook?

**Connect:** `ssh speakasap && cd speakasap-portal`

### 2.1 Helpdesk / webhook logs

```bash
# Django/celery logs (paths may vary; adjust if your app logs elsewhere)
grep -E 'WEBHOOK|email.received|process_inbound_email|lisapet|stashok|Сташок|8o7nele9c5j7rbdrcutg7hon7ne7ossan51d9qg1' /var/log/speakasap/*.log 2>/dev/null | tail -100
# Or wherever helpdesk/celery log (e.g. journalctl, supervisor logs)
```

**Look for:** Inbound webhook received (`[WEBHOOK]`), `process_inbound_email_async`, and any errors or stack traces.

### 2.2 Celery (async task that creates the ticket)

The webhook returns 200 quickly and processing runs in Celery. If Celery is down or the task fails, no ticket is created.

```bash
# Check Celery worker is running and recent tasks
celery -A portal inspect active 2>/dev/null || true
# If you use flower or task results, check for failed tasks for queue 'email' or task name 'process_inbound_email_async'
```

Check Celery logs for errors around the time of the email (e.g. 2026-02-21 12:34–12:36 UTC):

```bash
grep -E 'process_inbound_email_async|Error|Exception|lisapet|stashok' /var/log/celery/*.log 2>/dev/null | tail -80
```

### 2.3 Webhook URL and subscription

Ensure the helpdesk subscription in notifications-microservice points to the URL that speakasap-portal actually serves:

```bash
source ~/notifications-microservice/.env
curl -s -H "Authorization: Bearer $SERVICE_TOKEN" 'https://notifications.statex.cz/webhooks/subscriptions' | jq '.[] | select(.serviceName=="helpdesk") | {webhookUrl, status, filters}'
```

The `webhookUrl` should be reachable from statex (e.g. `https://speakasap.com/helpdesk/api/email/inbound/`). Test from statex:

```bash
# On statex
curl -s -o /dev/null -w "%{http_code}" https://speakasap.com/helpdesk/health/
curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' https://speakasap.com/helpdesk/api/email/inbound/
# Expect 200 for both; if not, helpdesk may be down or blocking requests.
```

### 2.4 Manual reprocess (if email is in notifications but not in helpdesk)

If the email is in `inbound_emails` (step 1.1) but no ticket exists, trigger the poll task or reprocess:

```bash
cd ~/speakasap-portal
# Option A: Reprocess recent emails (fetches from notifications-microservice API and queues tickets)
python manage.py reprocess_inbound_emails --limit 10

# Option B: Run the periodic poll task once (same logic as the scheduled job)
celery -A portal call helpdesk.poll_new_emails
```

---

## 3. Quick summary

| Step | Where | What to check |
|------|--------|----------------|
| 1 | AWS | Lambda returned CONTINUE → email saved to S3. S3 event notification enabled for bucket/prefix. SNS topic subscription to `https://notifications.statex.cz/email/inbound/s3` is **Confirmed**. |
| 2 | statex | Email appears in `GET /email/inbound` or DB `inbound_emails`. Logs show `processEmailFromS3` and `DELIVER TO SUBSCRIPTIONS` for that message. |
| 3 | statex | Helpdesk subscription is **active**, `filters.to` includes `*@speakasap.com`, `webhookUrl` is the helpdesk URL. Logs show "Successfully delivered to helpdesk" or an error. |
| 4 | speakasap | Webhook URL is reachable. Django/Celery logs show webhook received and `process_inbound_email_async` run (and no errors). Ticket created in DB or UI. |

If the email **is not** in `inbound_emails`, the break is before or at notifications-microservice (S3 event → SNS → `/email/inbound/s3`). If it **is** in `inbound_emails` but no ticket, the break is webhook delivery or helpdesk processing (subscription filter, health check, webhook POST, or Celery task).

**Where it can get stuck (summary):**

| What you see | Where it's stuck |
|--------------|-------------------|
| Not in DB | SES/S3 not received; S3 event not firing; SNS not calling `/email/inbound/s3` or subscription not Confirmed; or `processEmailFromS3` failed (parse/DB error). Check AWS S3/SNS and container logs for `CONTROLLER`, `S3_PROCESS`. |
| In DB, no helpdesk delivery row | Filter did not match (e.g. `to` not *@speakasap.com), or health check failed (helpdesk URL returned non-200), or exception before/during POST. Check logs: `WEBHOOK_DELIVERY`, `Filter check result`, `Exception caught`. |
| In DB, helpdesk status= sent | Webhook returned 2xx but helpdesk did not call delivery-confirmation; or Celery task failed after receiving webhook. Check speakasap-portal/Celery. |
| In DB, helpdesk status= delivered | Notifications did its part. If ticket still missing, check helpdesk/Celery (task failed after confirmation). |

---

## 4. Root cause: duplicate check merging different emails (fixed Feb 2026)

**Symptom:** Email is in S3 and Lambda returned CONTINUE, but no row in `inbound_emails` and no helpdesk ticket.

**Cause:** The service used three duplicate checks before creating a new inbound email. **Check 3** (from+to+subject+date within 5 minutes) could treat two *different* emails as one: when a second email arrived from the same sender to the same recipient with the same subject within 5 minutes, it was treated as "existing" and only the DB row was updated—**no webhook was sent**, so no helpdesk ticket.

**Fix applied:** Check 3 was removed. Duplicate detection now uses only:

- **Check 1:** same Message-ID header (same email)
- **Check 2:** same S3 object key (same object processed twice, e.g. SNS retry)

After pulling the fix, redeploy the notifications-microservice so new S3 events are processed correctly.

**Manual reprocess** (if the email is in S3 but was skipped): From statex, with `SERVICE_TOKEN` from `notifications-microservice/.env`:

```bash
source ~/notifications-microservice/.env
curl -s -X POST "https://notifications.statex.cz/email/inbound/s3" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bucket":"speakasap-email-forward","key":"forwards/<S3_OBJECT_KEY>"}'
```

Use the S3 object key (e.g. SES messageId like `ddicgd5evteehpiq0n0as99htk6ap1q30f5lqoo1`) from the S3 console or from the Lambda/CloudWatch mail.messageId.

---

## 5. Numbers and tickets increasing (no new emails from Amazon)

**Symptom:** Undelivered count and helpdesk tickets keep increasing even though you don't expect new emails from S3.

**Cause:** The **S3 catchup scheduler** runs every 5 minutes and processes "unprocessed" S3 object keys: it lists objects in the bucket, finds those not yet in `inbound_emails`, and calls `processEmailFromS3` for each (up to `S3_CATCHUP_MAX_KEYS_PER_RUN` per run, default 10). So old emails that were never ingested (e.g. from before SNS was set up) are processed over time, creating new DB rows and tickets.

**Fix:**

1. **Disable the scheduler** (stops all catchup from old S3 objects): On prod, add to `notifications-microservice/.env`:

   ```bash
   S3_CATCHUP_DISABLED=true
   ```

   Restart the service. New emails will still be processed when SNS sends events to `POST /email/inbound/s3`.

2. **Only process recent S3 objects** (e.g. last 24 hours): Add to `.env`:

   ```bash
   S3_CATCHUP_ONLY_LAST_HOURS=24
   ```

   The scheduler will only consider objects with `LastModified` in the last 24 hours; old backlog is ignored.

Check logs for `[S3_CATCHUP]` to confirm the scheduler is running and how many keys it processes each run.

---

## 6. Drain backlog: all emails in DB and marked delivered to helpdesk

**Goal:** Every email stored in the notifications DB and marked as delivered to helpdesk (so after you close/delete tickets in helpdesk, the system is in a clean state: no re-sends, undelivered count 0).

**Steps:**

1. **Optional:** Ensure S3 catchup is enabled so old S3 objects are considered. If you previously set `S3_CATCHUP_DISABLED=true`, remove it or set to `false` for the drain. Do **not** set `S3_CATCHUP_ONLY_LAST_HOURS` during the drain (or the scheduler would skip old keys).

2. **Run the drain script on prod** (uses localhost to avoid proxy timeout):

   cd ~/notifications-microservice
   ./scripts/drain-all-undelivered.sh

   ```

   This loops `POST /email/inbound/process-undelivered` with `dbLimit=50` and `s3MaxKeys=50` until no more DB undelivered and no more unprocessed S3 keys. Each successful webhook (2xx) is marked delivered automatically.

3. **After the drain finishes:** Set `S3_CATCHUP_DISABLED=true` in `.env` and restart the service so only real-time SNS events are processed from now on (no more backlog). Or set `S3_CATCHUP_ONLY_LAST_HOURS=24` to only process S3 objects from the last 24 hours.

4. You can then close or delete tickets in the helpdesk as needed; the notifications DB will show every email as delivered.
