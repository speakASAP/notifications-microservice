# Goal 7.4 Orders Events Notifications Integration

```yaml
id: NOTIFICATIONS-ORDERS-EVENTS-INTEGRATION
status: validated-contract-boundary
owner: Notifications integration owner
created: 2026-07-01
last_updated: 2026-07-02
source_of_truth:
  notifications_repo: /home/ssf/Documents/Github/notifications-microservice
  orders_repo_readonly: /home/ssf/Documents/Github/orders-microservice
```

## Vision

Statex services communicate through bounded service contracts. Orders remains the canonical source of order lifecycle truth, while Notifications owns delivery through email, Telegram, WhatsApp, and later channels.

## Goal Impact

Goal 7.4 gives Notifications a narrow, testable path to consume canonical Orders lifecycle signals without copying order ownership, customer data, payment identity, stock truth, or channel state into Notifications.

## System

- Orders publishes versioned RabbitMQ routing keys on the durable `orders.events` exchange.
- Notifications currently exposes HTTP `/notifications/send` and owns outbound delivery persistence.
- Notifications did not have an Orders RabbitMQ consumer, AMQP dependency in `package.json`, or RabbitMQ runtime env keys in Kubernetes config at inspection time.

## Feature

Notifications can map validated Orders lifecycle envelopes to existing notification send DTOs when an operations/transactional notification recipient is configured. The mapper stores bounded Orders event metadata in `templateData.ordersEvent` for audit and idempotency.

## Task

Implemented in this lane:

- `src/notifications/orders-events/order-event.dto.ts` validates canonical Orders event envelopes and rejects payloads containing forbidden sensitive keys.
- `src/notifications/orders-events/orders-event-notification.router.ts` maps valid events to the existing `NotificationsService.send()` path.
- `src/notifications/orders-events/orders-event-notification.router.spec.ts` covers routing, event-id idempotency, duplicate suppression, missing-recipient blocking, and sensitive payload rejection.

## Execution Plan

1. Verify Orders event contract from Orders repo docs/source.
2. Verify Notifications architecture and runtime config.
3. Add the narrow contract boundary and router without inventing broker transport.
4. Add focused tests for routing, idempotency, and dedupe.
5. Document live-consumer blockers with `[MISSING: ...]` markers.
6. Defer deployment until runtime config is present and validation is complete.

## Coding Prompt

Implement the smallest Notifications-owned code that can accept canonical Orders event envelopes, validate allowed event shapes, route them through the existing notification send surface, and avoid duplicate notifications on repeated delivery of the same Orders `eventId`. Do not edit Orders. Do not create customer-contact assumptions from order events.

## Code

Orders event types verified from `orders-microservice`:

- `orders.order.created.v1`
- `orders.order.updated.v1`
- `orders.order.paid.v1`
- `orders.order.shipped.v1`
- `orders.order.cancelled.v1`
- `orders.order.lifecycle_changed.v1`

Notifications routing behavior:

- `created` -> `order_confirmation`
- `updated` -> `order_status_update`
- `paid` -> `payment_confirmation`
- `shipped` -> `shipment_tracking`
- `cancelled` -> `order_status_update`
- `lifecycleChanged` -> `order_status_update`

Required runtime recipient config before any live send:

- `[MISSING: ORDERS_EVENTS_NOTIFICATION_RECIPIENT in Notifications runtime config]`

Optional routing config:

- `ORDERS_EVENTS_NOTIFICATION_CHANNEL`: `email`, `telegram`, or `whatsapp`; default `email`.
- `ORDERS_EVENTS_NOTIFICATION_CHANNEL_KEY`: optional channel-registry key; default `orders.lifecycle`.

## Validation

Validation commands for this lane:

```bash
git status --short --branch
npm test -- --runTestsByPath src/notifications/orders-events/orders-event-notification.router.spec.ts
npm run build
npm test
git diff --check
git status --short --branch
```

Runtime config check must print names/presence only, not values:

```bash
kubectl -n statex-apps get configmap notifications-microservice-config -o go-template='{{range $k,$v := .data}}{{println $k}}{{end}}'
kubectl -n statex-apps get secret notifications-microservice-secret -o go-template='{{range $k,$v := .data}}{{println $k}}{{end}}'
```

Validation evidence collected on 2026-07-02 branch update:

- `npm test -- --runTestsByPath src/notifications/orders-events/orders-event-notification.router.spec.ts`: pass, 6 tests after adding `orders.order.lifecycle_changed.v1` coverage.
- `npm run build`: pass.
- `npm test -- --runInBand`: pass, 6 suites and 26 tests.
- `git diff --check`: pass.
- No deployment, live broker consumer, runtime recipient change, notification send, or secret read was performed.

Validation evidence collected on 2026-07-01:

- `git status --short --branch`: started clean on `main...origin/main` before edits.
- `npm test -- --runTestsByPath src/notifications/orders-events/orders-event-notification.router.spec.ts`: pass, 5 tests.
- `npm run build`: pass.
- `npm test`: pass, 4 suites and 19 tests.
- `git diff --check`: pass.
- Runtime ConfigMap key-name audit: no `RABBIT*` or `ORDERS_EVENTS*` keys present; only existing matching operational names such as `NODE_ENV`, `PORT`, and `SERVICE_NAME` were printed.
- Runtime Secret key-name audit: no `RABBIT*` or `ORDERS_EVENTS*` keys present; existing secret names such as `JWT_SECRET` and `SERVICE_TOKEN` were present without values printed.

## Live Consumer Blockers

- `[MISSING: Notifications-owned RabbitMQ consumer module or approved transport dependency]`
- `[MISSING: Notifications runtime RABBITMQ_URL or broker secret source]`
- `[MISSING: Orders-events queue name, binding ownership, dead-letter/retry policy, and deployment owner]`
- `[MISSING: Production value for ORDERS_EVENTS_NOTIFICATION_RECIPIENT or an approved channel-registry route that provides a recipient]`
- `[MISSING: Deployment approval after validation and runtime config confirmation]`

## Parallel Execution

| Workstream | Status | Owner role | Scope | Allowed files | Forbidden files | Dependencies | Expected output | Validation owner | Merge order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Broker consumer wiring | dependency-gated | Notifications backend agent | Add AMQP/Nest transport after runtime contract approval | `src/notifications/orders-events/*`, `src/notifications/notifications.module.ts`, `package.json`, `package-lock.json`, `k8s/*` | Orders and other services | Broker URL secret source, queue/binding/DLX contract | Live consumer calling `OrdersEventNotificationRouter.route()` | Integration owner | 1 |
| B. Recipient/channel policy | dependency-gated | Notifications operations agent | Add approved runtime recipient or channel-registry route | `k8s/configmap.yaml`, `k8s/external-secret.yaml`, docs | Source code outside Notifications | Owner-approved recipient/channel policy | Runtime config names present without secret values | Integration owner | 2 |
| C. Final deploy and smoke | final integration | Integration owner | Deploy and verify after A/B | deploy script and Kubernetes rollout only | DB destructive operations | A and B merged, full validation green | Production rollout evidence and no secret leakage | Integration owner | 3 |

## Handoff Notes

This lane intentionally does not deploy. The code boundary is ready for a future consumer, but live consumption remains blocked until broker and recipient runtime contracts are confirmed.
