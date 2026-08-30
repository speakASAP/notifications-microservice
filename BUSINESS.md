# Business: notifications-microservice

```yaml
id: BUSINESS-notifications-microservice
status: approved
owner: project owner
created: 2026-06-13
last_updated: 2026-08-30
completeness_level: complete
```

> ⚠️ IMMUTABLE BY AI.

## Problem

Ecosystem services need one place to send email, Telegram, and WhatsApp notifications instead of each service integrating separately with SendGrid/SES, Telegram, and WhatsApp APIs.

## Target users and stakeholders

- All ecosystem applications, `marketing-microservice`, `orders-microservice`, and `runlayer` as notification senders.
- Administrators using the JWT-protected admin panel to review stats/history.
- Helpdesk recipients of inbound-email webhook deliveries.

## Value proposition

A single multi-channel notification API (email/Telegram/WhatsApp) with webhook subscription delivery, inbound email handling, and admin visibility, so callers do not each integrate directly with SendGrid/SES/Telegram/WhatsApp.

## Goals

- Deliver notifications across email (AWS SES active path), Telegram, and WhatsApp.
- Support inbound email parsing and webhook-based delivery to helpdesk.
- Provide admin stats/history visibility protected by JWT roles.

## Non-goals

- Persisted, admin-managed template catalog is not implemented yet (documented as a known gap in `SYSTEM.md`).
- Not a marketing campaign engine — `marketing-microservice` owns campaign logic and calls this service to deliver.

## Success metrics

- `POST /notifications/send` successfully delivers across all three channels.
- Inbound email webhook path (`S3 -> SNS -> /email/inbound/s3`) delivers to helpdesk with deduplication.
- Admin endpoints correctly enforce JWT role checks.

## Business constraints

- AI must never send mass notifications without explicit approval.
- API keys (SendGrid, Telegram, WhatsApp) managed in `.env`/Vault only.
- Rate limits must be respected per channel.
- Port: 3368 (<http://notifications-microservice:3368>)
- Production: <https://notifications.alfares.cz>

## Approval

Status: approved
Approved by: project owner
Approval evidence: owner-confirmation: notifications-microservice-onboarding-approved
