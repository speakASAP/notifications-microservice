# Notifications Admin Goals

## Active Goal: Goal 7.4 Orders Events Notifications Integration

Create a narrow, intent-preserved Notifications integration boundary for canonical Orders lifecycle events while keeping Orders as the source of truth.

## Goal 7.4 Success Criteria

- [x] Verify Orders event contracts from `orders-microservice` source/docs without editing Orders.
- [x] Verify Notifications has no existing RabbitMQ Orders consumer or broker runtime config.
- [x] Add DTO/schema validation for canonical Orders lifecycle events.
- [x] Route valid Orders events to the existing notification send path when a notification recipient is configured.
- [x] Add event-id idempotency and notification dedupe guard before sending.
- [x] Add focused unit/contract tests for routing, idempotency, and dedupe.
- [x] Preserve blockers for live broker consumption as `[MISSING: ...]` instead of inventing runtime contracts.
- [x] Accept and route `orders.order.lifecycle_changed.v1` to the bounded Orders lifecycle notification path.
- [ ] Wire a live RabbitMQ consumer after broker dependency, queue, bindings, and runtime env ownership are approved.
- [ ] Deploy only after implementation validation and runtime config are complete.

## Prior Active Goal

Create an intent-preserved, goals-driven admin frontend for the notifications microservice on `alfares`, documenting the notifications domain and making communication flows controllable by an admin.

## Success Criteria

- [x] Map the actual notifications APIs, entities, channels, lifecycle, and integration points.
- [x] Preserve the domain intent and known documentation mismatches in repository docs.
- [x] Create a light, readable admin UI from scratch under `web/admin/index.html`.
- [x] Show ecosystem flow, channel health, stats, message stream, inbound email, webhook subscriptions, settings, and docs status.
- [x] Let admins edit outbound message subject/body/template JSON/status.
- [x] Let admins edit inbound email subject/body/status.
- [x] Let admins edit channel registry policy fields.
- [x] Let admins inspect and update webhook subscription fields.
- [x] Build the service successfully.
- [x] Deploy to Kubernetes with `./scripts/deploy.sh`.
- [x] Verify `https://notifications.alfares.cz/admin` loads and the admin UI renders.

## Guardrails

- Test-send actions must require explicit user confirmation.
- Do not expose secrets in the frontend.
- Do not invent a persisted template system until a backend model/controller exists.
- Preserve S3 inbound public endpoint behavior.
- Keep UI styling light and balanced, avoiding heavy dark-blue or dark-teal surfaces.
