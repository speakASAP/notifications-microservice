# Vision: notifications-microservice

> Protected intent baseline. Human approval is required. AI agents may draft
> only from owner-provided or approved source material and must not modify the
> approved baseline directly.

```yaml
id: VISION-notifications-microservice
status: approved
owner: project owner
created: 2026-08-30
last_updated: 2026-08-30
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
downstream:
  - ../../BUSINESS.md
  - ../17_governance/PROJECT_INVARIANTS.md
```

## One-sentence vision

Provide one reliable multi-channel (email/Telegram/WhatsApp) notification API for the whole ecosystem, including inbound email handling and webhook delivery.

## Problem statement

Without a shared notification service, every application would have to integrate separately with SendGrid/SES, Telegram, and WhatsApp, duplicating rate-limit handling, delivery tracking, and inbound-email parsing.

## Target users

Ecosystem applications (`orders-microservice`, `marketing-microservice`, `runlayer`, client apps) as senders; administrators using the JWT-protected admin panel; helpdesk as inbound-email recipient.

## Core user need

Callers need a dependable way to send a notification across a channel without owning provider integration, rate-limit, or delivery-tracking logic themselves.

## Key outcomes

1. `POST /notifications/send` delivers across email/Telegram/WhatsApp.
2. Inbound email (SES -> S3 -> SNS -> `/email/inbound/s3`) reaches helpdesk with deduplication.
3. Admin stats/history/channel-registry endpoints are JWT-protected.
4. Webhook subscriptions support activation/suspension and retry with backoff.

## Non-goals

- Not a marketing campaign engine.
- Does not yet provide a persisted, admin-managed template catalog (tracked as a known gap).

## Success criteria

- All three channels deliver successfully from `POST /notifications/send`.
- Admin endpoints reject requests without a valid JWT role.
- Inbound email delivery is deduplicated and retried with exponential backoff.

## Approval

Status: approved
Approved by: project owner
Approval evidence: owner-confirmation: notifications-microservice-onboarding-approved
