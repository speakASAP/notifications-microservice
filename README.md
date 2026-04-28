# Notifications Microservice

Multi-channel notification delivery service for the Statex ecosystem. Sends email (SendGrid and AWS SES), Telegram, and WhatsApp notifications on behalf of orders-microservice, marketing-microservice, business-orchestrator, and all client applications. Built on NestJS, port 3368, domain https://notifications.alfares.cz.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /notifications/send | Send email/Telegram/WhatsApp notification |
| GET | /notifications/history | Notification history |
| GET | /notifications/status/:id | Notification status |
| GET | /health | Health check |
| GET | /api/config | Public frontend config |
| GET | /admin/stats | Admin statistics (JWT) |
| GET | /admin/history | Admin history (JWT) |
| GET | /admin/params | Admin params (JWT) |
| POST | /email/inbound | AWS SES SNS webhook |
| POST | /email/inbound/s3 | S3 event SNS webhook |
| POST/GET/PUT/DELETE | /api/webhooks/subscriptions | Webhook subscriptions CRUD |
| POST | /api/webhooks/subscriptions/:id/activate | Activate subscription |
| POST | /api/webhooks/subscriptions/:id/suspend | Suspend subscription |
| POST | /api/webhooks/payment-result | Payment callback |

## Inbound Email Flow

- AWS SES receives email and stores it in S3 (bucket: `speakasap-email-forward`, prefix `forwards/`)
- S3 event triggers SNS topic, which POSTs to `/email/inbound/s3`
- Service fetches the full email from S3 and parses MIME
- Delivers to helpdesk via webhook subscription
- Deduplication by message ID; auto-retries with exponential backoff

## Web Interface

- Admin panel available at https://notifications.alfares.cz/admin
- Requires JWT authentication for admin routes

## Configuration

See `INFRA.md` for deployment architecture, environment variables, and Kubernetes setup. Live config values are in `k8s/configmap.yaml`. Secrets are stored in Vault at `secret/prod/notifications-microservice`.

## Docs Index

| Doc | Description |
|-----|-------------|
| `docs/DEPLOYMENT.md` | Deploy, rollback, secrets rotation |
| `docs/WEBHOOK_SUBSCRIPTIONS.md` | Webhook subscription API and payload format |
| `docs/WEBHOOK_IMPROVEMENTS.md` | Retry logic, backoff, auto-resume suspended subs |
| `docs/DELIVERY_CONFIRMATION.md` | Helpdesk delivery confirmation API |
| `docs/AWS_SIMPLE_INBOUND_SETUP.md` | Minimal AWS inbound email setup |
| `docs/S3_EVENT_NOTIFICATION_SETUP_s3-email-events-new.md` | S3 event notification setup |
| `docs/S3_FIRST_STRATEGY.md` | S3-first email fetch strategy |
| `docs/SES_VS_S3_EVENT_SNS.md` | Difference between SES-SNS and S3-event-SNS |
| `docs/RAW_MESSAGE_DELIVERY_IMPLEMENTATION.md` | SNS raw vs wrapped delivery |
| `docs/EMAIL_DELIVERY_POLICY.md` | speakasap.com delivery policy |
| `docs/DUPLICATE_WEBHOOK_FIX.md` | Deduplication and subject encoding fix |
| `docs/SPAM_REPORTING_AND_FILTERING.md` | Spam filter options |
| `docs/SPAM_VERDICT_AWS_CONSOLE_STEPS.md` | AWS Lambda spam filter setup |
| `docs/TRACE_WEBHOOK_HANG.md` | Debug email delivery hangs |
| `docs/TROUBLESHOOT_EMAIL_NOT_IN_HELPDESK.md` | Full troubleshooting checklist |
| `docs/LOGGING_AND_SES.md` | SES send stats and logging setup |

## Quick Ops

```bash
# Health check
kubectl exec -n statex-apps deploy/notifications-microservice -- wget -q http://localhost:3368/health -O-

# Deploy
./scripts/deploy.sh

# Logs
kubectl logs -n statex-apps deploy/notifications-microservice --tail=50 -f

# Rollout status
kubectl rollout status deploy/notifications-microservice -n statex-apps
```
