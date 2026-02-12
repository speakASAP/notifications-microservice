# Trace: Email Received but Ticket Not Created (Where It Hangs)

When a test email is sent but no helpdesk ticket appears, follow this to find where the flow stops.

## Flow (short)

1. **SES → Notifications**  
   AWS SNS POST to `notifications.statex.cz/email/inbound` → controller → `handleSESNotification` → `parseEmailContent` → `storeInboundEmail` → **`processInboundEmail`** → **`deliverToSubscriptions`**.

2. **Notifications → Portal**  
   For each active subscription: filter match → health check → **HTTP POST** to `https://speakasap.com/helpdesk/api/email/webhook/` (timeout 120s by default). Waits for 200.

3. **Portal webhook**  
   View parses JSON, idempotency check (DB), **`process_inbound_email_async.delay()`** (Celery), returns 200 immediately.

4. **Celery**  
   Worker (queue **`email`**) runs `process_inbound_email_async` → `process_email` → create ticket → `_confirm_delivery_to_notifications`.

---

## 1. Notifications (statex)

**Where:** Container logs of `notifications-microservice` (e.g. `docker compose -f docker-compose.blue.yml logs -f notification-service`, or your log aggregator).

**Grep in order (for the time you sent the test email):**

| Log message | Meaning |
|------------|--------|
| `[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST START =====` | SES notification reached the service. |
| `[SERVICE] Calling processInboundEmail...` | Email stored, starting processing. |
| `[WEBHOOK_DELIVERY] Delivering to subscription: helpdesk` | About to deliver to helpdesk. |
| `[WEBHOOK_DELIVERY] Filter check result ... MATCH` | Email passed subscription filter. |
| `[WEBHOOK_DELIVERY] Health check result ... HEALTHY` | Health check passed (or "allowing delivery" if health failed but we still allow). |
| `[WEBHOOK_DELIVERY] Sending HTTP POST request to ... timeout:` | **Starting POST to portal.** If this is the **last** line for that email, the **hang is here**: portal not responding or slow (up to timeout). |
| `[WEBHOOK_DELIVERY] HTTP request completed in ... ms, status:` | Portal responded. |
| `[WEBHOOK_DELIVERY] ✅ Successfully delivered to helpdesk` | Delivery done; problem is on portal/Celery side. |

**If you never see `[CONTROLLER] INBOUND EMAIL WEBHOOK REQUEST START`** for that time: email did not reach the service (SES rule, SNS, or network to statex).

**If you see `NO MATCH`** for filter: subscription `filters.to` does not match this recipient. Fix: e.g. `*@speakasap.com` (run `scripts/update-helpdesk-subscription-filter.sh`).

**If you see `Health check failed`** and then no POST: health check failed and we still allow delivery, so next line should be "Sending HTTP POST". If delivery is skipped, check code path for health.

---

## 2. Portal webhook (speakasap)

**Where:** Django/app logs (e.g. gunicorn/uWSGI logs, or central logging for speakasap-portal).

**Grep in order:**

| Log message | Meaning |
|------------|--------|
| `[WEBHOOK] ===== INBOUND EMAIL WEBHOOK REQUEST START =====` | Request reached the portal. If this is **missing** but notifications shows "Sending HTTP POST", the **hang is network/nginx** between statex and speakasap (or portal not responding in time). |
| `[WEBHOOK] ✅ Parsed webhook payload` | JSON parsed. |
| `[WEBHOOK] Idempotency check took ... ticket_exists: ... comment_exists: ...` | DB check done. If logs stop here, **hang is in idempotency** (DB slow/lock). |
| `[WEBHOOK] Celery .delay() returned in ... task_id:` | Task queued. If you see "Queued email" but no ticket, **hang is in Celery** (worker or queue). |
| `[WEBHOOK] ===== INBOUND EMAIL WEBHOOK REQUEST END (QUEUED) =====` | View finished; HTTP 200 was sent. |

---

## 3. Celery (speakasap)

**Where:** Celery worker logs (queue **`email`**).

**Grep:**

| Log message | Meaning |
|------------|--------|
| `[ASYNC_TASK] ===== PROCESS INBOUND EMAIL ASYNC START =====` | Task started. If this never appears, worker is not consuming queue `email` or task was not queued. |
| `[ASYNC_TASK] Calling processor.process_email` | About to create ticket/comment. |
| `[ASYNC_TASK] ✅ Created new ticket:` or `Added comment to ticket:` | Ticket/comment created. |
| `[ASYNC_TASK] _confirm_delivery_to_notifications done` | Delivery confirmation sent to notifications. |
| `[ASYNC_TASK] ===== PROCESS INBOUND EMAIL ASYNC END (SUCCESS) =====` | Task finished. |

**If ASYNC_TASK START never appears:** Ensure a Celery worker is running with queue `email`, e.g. `celery -A portal worker -Q email -l info` (or your project’s app name and queue list).

---

## Quick commands (adjust paths / container names to your setup)

**Statex – last 200 lines of notification-service logs, then grep for webhook delivery:**

```bash
ssh statex 'docker compose -f ~/notifications-microservice/docker-compose.blue.yml logs --tail=200 notification-service 2>&1' | grep -E 'CONTROLLER|PROCESS|WEBHOOK_DELIVERY'
```

**Speakasap – recent webhook and async task lines:**

```bash
ssh speakasap 'grep -E "\[WEBHOOK\]|\[ASYNC_TASK\]" /path/to/portal/logs/*.log | tail -80'
```

(Replace `/path/to/portal/logs/` with your actual log path or use `journalctl`/your logging stack.)

---

## Summary: “Where it hangs”

| Last log you see (notifications) | Last log you see (portal) | Hang spot |
|----------------------------------|---------------------------|-----------|
| Before "Sending HTTP POST" | - | Notifications (filter / health / prep). |
| "Sending HTTP POST request to ..." | No `[WEBHOOK] ... START` | **HTTP POST to portal** (timeout, network, nginx, portal down). |
| "Successfully delivered to helpdesk" | `[WEBHOOK] ... START` but not "Queued email" | **Portal view** (idempotency/DB or .delay()). |
| "Successfully delivered" | "Queued email" | No `[ASYNC_TASK] START` → **Celery** (queue/worker). |
| "Successfully delivered" | "Queued" + `[ASYNC_TASK] START` but no "Created new ticket" | **Celery task** (process_email or exception). |
