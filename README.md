# Notifications Microservice

Multi-channel notification delivery service for the Statex ecosystem. Sends email (AWS SES active path), Telegram, and WhatsApp notifications on behalf of orders-microservice, marketing-microservice, runlayer, and all client applications. Built on NestJS, port 3368, domain https://notifications.alfares.cz.

## Status

Production, deployed to Kubernetes namespace `statex-apps`.

## Documentation Authority

`BUSINESS.md` and `SYSTEM.md` are authoritative; this README documents usage. See `docs/00_constitution/CONSTITUTION.md` and `docs/01_vision/VISION.md` for the approved IPS baseline.

## Capabilities

- Multi-channel send (email/Telegram/WhatsApp) via `POST /notifications/send`.
- Inbound email parsing and helpdesk delivery via AWS SES/S3/SNS webhooks.
- Webhook subscription CRUD and payment-result callback delivery.
- Admin stats/history/channel-registry endpoints protected by JWT.

## Configuration

Deployment architecture, environment variables, and Kubernetes setup are documented in `INFRA.md`. Live config values are in `k8s/configmap.yaml`; secrets are stored in Vault at `secret/prod/notifications-microservice`.

## Deployment

Deployed via the shared serialized deploy runner (`./scripts/deploy.sh`) to the `statex-apps` namespace, domain `https://notifications.alfares.cz`.

## Health and Observability

`GET /health` provides the liveness/readiness signal used by Kubernetes probes; see Quick Ops below for `kubectl` health/log commands.

## Interfaces

This service exposes a single HTTP REST API (no gRPC/GraphQL) covering send, history/status, admin, inbound-email webhooks, and webhook-subscription management, listed in the table below.

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
| GET | /admin/channels | Channel registry list (JWT) |
| GET | /admin/channels/:channelKey | Channel registry detail (JWT) |
| POST | /email/inbound | AWS SES SNS webhook |
| POST | /email/inbound/s3 | S3 event SNS webhook |
| POST/GET/PUT/DELETE | /webhooks/subscriptions | Webhook subscriptions CRUD |
| POST | /webhooks/subscriptions/:id/activate | Activate subscription |
| POST | /webhooks/subscriptions/:id/suspend | Suspend subscription |
| POST | /webhooks/payment-result | Payment callback |


## Template Behavior

Current send behavior does not include persisted template management. Callers send an inline `message` body and may include `templateData`; channel senders perform simple `{{key}}` replacement against that data where supported. There is no implemented `/templates` controller, template table, or Handlebars-backed template catalog in this service yet. Central template management remains a future product design item until a backend model and admin workflow are added.

## Inbound Email Flow

- AWS SES receives email and stores it in S3 (bucket: `speakasap-email-forward`, prefix `forwards/`)
- S3 event triggers SNS topic, which POSTs to `/email/inbound/s3`
- Service fetches the full email from S3 and parses MIME
- Delivers to helpdesk via webhook subscription
- Deduplication by message ID; auto-retries with exponential backoff

## Web Interface

- Admin panel available at https://notifications.alfares.cz/admin
- Requires JWT authentication for admin routes

## Configuration Reference

See `INFRA.md` for deployment architecture, environment variables, and Kubernetes setup. Live config values are in `k8s/configmap.yaml`. Secrets are stored in Vault at `secret/prod/notifications-microservice`.

## Channel Registry Migration Notes

- New table: `channel_registry` (migration `1746445200000-CreateChannelRegistryTable`).
- Backward compatibility: `/notifications/send` keeps legacy behavior when `channelKey` is omitted.
- For migration from env defaults, bootstrap a default active channel row that mirrors current `AWS_SES_*` or `SENDGRID_*` sender keys (keys only in docs, values from env/Vault).
- Runtime policy for marketing callers:
  - pass `channelKey` when campaign-level channel routing is explicit;
  - include `purpose` (for example `marketing`) so notifications can enforce channel policy;
  - fallback remains the legacy default sender path when `channelKey` is not provided.

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

# Deployment convergence
/home/ssf/Documents/Github/shared/scripts/wait-for-rollout.sh -n statex-apps notifications-microservice
```

## Development

This is a NestJS/TypeScript service. Install dependencies with `npm install`, run locally with `npm run start:dev`, and run the test suite with `npm test`. Environment variables mirror the production `k8s/configmap.yaml`/Vault keys documented in `docs/DEPLOYMENT.md`; use a local `.env` for development-only values.
