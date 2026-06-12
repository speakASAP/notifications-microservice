# System: notifications-microservice

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
