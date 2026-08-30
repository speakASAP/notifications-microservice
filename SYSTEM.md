# System: notifications-microservice

```yaml
id: SYSTEM-notifications-microservice
status: reviewed
owner: engineering
created: 2026-06-13
last_updated: 2026-08-30
completeness_level: complete
```

## Purpose

`notifications-microservice` is the ecosystem's multi-channel notification delivery service (email, Telegram, WhatsApp) with inbound email handling and webhook subscriptions.

## Responsibilities

- Send notifications via `POST /notifications/send` across email/Telegram/WhatsApp.
- Parse and deliver inbound AWS SES email to helpdesk via webhook subscriptions.
- Serve admin stats/history/channel-registry endpoints under JWT protection.
- Manage webhook subscription CRUD and payment-result callback delivery.

## Non-responsibilities

- Does not implement a persisted, admin-managed template catalog (documented known gap).
- Does not own marketing campaign logic — that belongs to `marketing-microservice`.
- Does not authenticate end users itself; it validates JWTs issued elsewhere for admin routes.

## Inputs

- `POST /notifications/send` requests from ecosystem callers.
- AWS SNS webhooks (`/email/inbound`, `/email/inbound/s3`) for inbound email.
- Webhook subscription CRUD requests and payment-result callbacks.

## Outputs

- Outbound email/Telegram/WhatsApp notifications.
- Notification history and status via `GET /notifications/history` and `/notifications/status/:id`.
- Admin stats/history/channel-registry responses.

## Dependencies

- `database-server` (`db-server-postgres:5432`) — notification history and channel registry storage.
- `logging-microservice` — structured logging.
- AWS SES/S3/SNS — inbound and outbound email transport.

## Upstream traceability

`../BUSINESS.md`, `docs/01_vision/VISION.md`.

## Downstream artifacts

`docs/06_architecture/INTEGRATION_CONTRACT.md`, `docs/11_tasks/TASK-001-bootstrap-service.md`, `TASKS.md`.

## Validation criteria

`GET /health` returns success; `POST /notifications/send` delivers on at least the active email path; admin endpoints reject requests without a valid JWT role.

## Open questions

Persisted template management design (model, controller, admin workflow) remains unscheduled — tracked in `TASKS.md`.

## Architecture

NestJS. Multi-channel delivery: Email (SendGrid/AWS SES), Telegram Bot, WhatsApp.

- Send endpoint: `POST /notifications/send`
- Admin endpoints: `GET /admin/stats`, `GET /admin/history`, `GET/PATCH /admin/channels/:channelKey`
- Webhook subscription endpoints: `/webhooks/subscriptions`
- Templates: inline message bodies with optional `templateData` replacement; no persisted `/templates` API exists yet
- Notification history stored in DB

## Integrations

| Dependency | URL |
|-----------|-----|
| database-server | db-server-postgres:5432 |
| logging-microservice | http://logging-microservice.statex-apps.svc.cluster.local:3367 |

## Current State
<!-- AI-maintained -->
Stage: production

## Known Issues
<!-- AI-maintained -->
- Persisted template management is not implemented; central templates remain future product work until a template model/controller is added.
