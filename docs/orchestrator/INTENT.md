# Notifications Microservice Intent

## Product Intent

The notifications microservice is the Statex ecosystem control point for operational communication. It must let admins see, inspect, edit, test, and repair notification traffic across outbound channels, inbound email, and downstream webhook delivery.

The admin frontend must make these flows visible:

- Event-producing services such as RunLayer, orders, marketing, helpdesk, auth, and other ecosystem services.
- Outbound delivery through email, Telegram, WhatsApp, and future SMS.
- Inbound email received through AWS SES/S3 and stored as `inbound_emails`.
- Webhook delivery of inbound emails to subscribers such as helpdesk.
- Channel policy resolution through `channel_registry`.
- Message lifecycle states: pending, sent, failed, received, processed, delivered.

## Source Of Truth

The current implementation is a NestJS service on port `3368`, deployed at `https://notifications.alfares.cz`.

Primary source files:

- `src/notifications/notifications.controller.ts` exposes send, history, and status APIs.
- `src/notifications/notifications.service.ts` resolves channel policy, suppresses duplicates, persists outbound records, sends through providers, and records sent or failed state.
- `src/notifications/channel-registry.service.ts` maps `channelKey` to provider, sender identity, allowed applications, allowed purposes, and fallback policy.
- `src/admin/admin.controller.ts` exposes dashboard stats, merged history, message detail, channel registry, and service params.
- `src/email/inbound-email.controller.ts` exposes inbound email list/detail/repair APIs and the public S3 event endpoint.
- `src/email/inbound-email.service.ts` parses, deduplicates, stores, processes, and redelivers inbound email.
- `src/email/webhook-subscription.controller.ts` exposes webhook subscription CRUD.
- `src/email/webhook-delivery.service.ts` records downstream delivery and confirmation state.

## Data Model

- `notifications`: outbound notification history with channel, type, recipient, subject, message, template data, status, provider, direction, service, message ID, and error.
- `channel_registry`: named send-channel policies and sender metadata.
- `inbound_emails`: received email metadata, text/html body, attachments, raw S3/SES data, status, and processing error.
- `webhook_subscriptions`: downstream services that receive inbound email webhooks.
- `webhook_deliveries`: per-email delivery status, HTTP result, ticket/comment IDs, and errors.

## Admin UX Intent

The admin console is a production operations tool, not a marketing page. It should remain light, dense, readable, and practical:

- First screen shows ecosystem flow, channel health, message stream, and an inspector.
- Admin can select any message and edit the stored subject/body/template JSON/status.
- Admin can edit channel registry policy and sender fields.
- Admin can inspect inbound email and trigger guarded repair actions.
- Admin can inspect and edit webhook subscriptions.
- Test sends must be explicit because sending real notifications can reach real users.

## Preserved Constraints

- Never send mass notifications without explicit approval.
- Secrets must stay in environment/Vault, not the frontend.
- Rate limits and provider-specific safety must be respected.
- `/email/inbound/s3` remains public because AWS SNS/S3 cannot send admin JWT.
- Admin APIs remain protected by `JwtRolesGuard` and require `global:superadmin` or `internal:notifications-microservice:admin`, with service-token support.

## Known Doc/Code Mismatches

- `SYSTEM.md` mentions `/notify`, `/templates`, and Handlebars, but no persisted template controller/table exists in the inspected source.
- `BUSINESS.md` says central template management is a goal, but current code uses inline message bodies plus simple `{{key}}` substitution.
- `README.md` references `docs/*` files that are missing from the live notifications checkout. The docs-rag snapshot retains those files under `docs-rag-microservice/docs/services/notifications-microservice/`.
- `README.md` lists `/api/webhooks/subscriptions`, while the implemented controller path is `/webhooks/subscriptions`.

## Admin Console Design Reference

Generated concept:

`/Users/Sergej.Stasok/.codex/generated_images/019ebaa4-f08d-7562-9c38-2af821a25c23/ig_0077ad18a53c86aa016a2bafafbd448191aa098a6470659d16.png`
