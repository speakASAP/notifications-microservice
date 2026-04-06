# System: notifications-microservice

## Architecture

NestJS. Multi-channel delivery: Email (SendGrid/AWS SES), Telegram Bot, WhatsApp.

- Endpoints: `POST /notify`, `GET /templates`, `POST /templates`
- Template engine: Handlebars
- Notification history stored in DB

## Integrations

| Dependency | URL |
|-----------|-----|
| database-server | db-server-postgres:5432 |
| logging-microservice | logging-microservice:3367 |

## Current State
<!-- AI-maintained -->
Stage: production

## Known Issues
<!-- AI-maintained -->
- None
