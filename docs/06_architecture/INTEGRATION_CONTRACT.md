# Integration Contract

## Purpose

`notifications-microservice` is the ecosystem's multi-channel (email/Telegram/WhatsApp) notification delivery and inbound-email service. This contract defines its real ecosystem dependencies and degraded-operation behavior.

## Capability decisions

The machine-readable decisions live in `ips-adoption.json`. This document adds
the human-readable architecture and contract links.

| Capability | Component | Decision | Contract/API/event | Configuration | Failure mode | Validation evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Auth | `auth-microservice` | required | JWT bearer verification for admin endpoints | Vault-provisioned JWT secret | Admin endpoints return 401/403; send/health endpoints unaffected | curl admin endpoint with/without valid JWT |
| PostgreSQL | `db-server-postgres` | required | Notification history and channel-registry storage | `db-server-postgres:5432` connection string via ExternalSecret | Send still attempts delivery; history/status endpoints degrade | DB connectivity check in health/readiness |
| Redis | `db-server-redis` | not-applicable | n/a | n/a | No caching/session layer documented for this service |
| Logging | `logging-microservice` | required | Structured log forwarding | `LOGGING_SERVICE_URL` | Local console fallback per ecosystem client convention | Log entries visible via logging-microservice query API |
| Notifications | `notifications-microservice` | not-applicable | n/a | n/a | This is the notifications-microservice itself |
| AI | `ai-microservice` | not-applicable | n/a | n/a | No AI-driven behavior in this service |
| Payments | `payments-microservice` | required | `POST /webhooks/payment-result` callback | Webhook subscription config | Callback failure logged; payment flow unaffected (notification-only) | Webhook subscription delivery test |
| Catalog | `catalog-microservice` | not-applicable | n/a | n/a | No catalog data is read or written |
| Orders | `orders-microservice` | required | Order-related notification sends (caller-initiated) | `POST /notifications/send` from orders-microservice | Send failure logged; order flow itself is not blocked | Notification history shows order-triggered sends |
| Warehouse | `warehouse-microservice` | not-applicable | n/a | n/a | No warehouse data is read or written |
| Invoices | `invoices-microservice` | not-applicable | n/a | n/a | No invoice data is read or written |
| Object storage | `minio-microservice` | not-applicable | n/a | n/a | Inbound email attachments/bodies are fetched from AWS S3, not the internal MinIO service |
| Events | RabbitMQ | not-applicable | n/a | n/a | Delivery is triggered synchronously via HTTP send calls and AWS SNS webhooks, not the ecosystem RabbitMQ bus |
| Documentation retrieval | `docs-rag-microservice` | required | Direct Git ingestion | Repository catalog | Git remains authoritative when retrieval is unavailable | Distinctive project phrase resolves to the owning repository path |
| Monitoring | `monitoring-microservice` | required | `GET /health` and probes | K8s manifests | Readiness blocks rollout | Health and readiness checks pass |
| Backups | `backups-microservice` | not-applicable | n/a | n/a | No documented centralized backup integration for notification history |

## Data ownership

`notifications-microservice` owns notification history, channel-registry, and webhook-subscription rows in `db-server-postgres`. It does not own order, payment, or marketing campaign data — it only records that a send was requested and its delivery outcome.

## Authentication and authorization

`POST /notifications/send` is called by trusted in-cluster services (no end-user auth). Admin endpoints (`/admin/*`) require a JWT with an appropriate role. `/email/inbound/s3` and `/email/inbound` remain public and unauthenticated by design, to accept AWS SNS webhook calls.

## Synchronous dependencies

- `auth-microservice` — JWT verification for admin endpoints.
- `db-server-postgres` — notification history and channel-registry reads/writes.
- AWS SES/S3/SNS — outbound email transport and inbound email retrieval.
- `logging-microservice` — structured log forwarding.

## Asynchronous dependencies

- AWS SNS webhook delivery for inbound email (`/email/inbound/s3`, `/email/inbound`) — deduplicated by message ID, retried with exponential backoff.
- Webhook subscription delivery to helpdesk — retried with backoff per `docs/WEBHOOK_IMPROVEMENTS.md`.

## Degraded operation

If `db-server-postgres` is unavailable, sends may still be attempted but history/status/channel-registry endpoints degrade or fail. If `auth-microservice` is unavailable, admin endpoints fail closed (401/403); the send path is unaffected since it does not require end-user auth.

## Validation

Adoption gate: `python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning`. Channel delivery and inbound-email flow are validated via the existing goal-based validation history recorded in `STATE.json`/`TASKS.md`.
