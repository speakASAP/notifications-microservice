# Orders Lifecycle Notification Consumer Plan

Date: 2026-07-02
Parent plan: `orders-microservice/docs/orchestrator/2026-07-02-order-lifecycle-warehouse-status-rollout-plan.md`

## Objective

Notifications should react to canonical Orders lifecycle events and notify customers/admins without becoming an order source of truth.

## Current Evidence

- Orders event notification router and mapping code exists.
- `[MISSING: live broker consumer module or approved transport dependency in Notifications runtime.]`

## Workstream

Owner role: Notifications consumer owner
Status: dependency-gated

Allowed files:

- `src/notifications/orders-events/**`
- notification module/bootstrap/config only where needed
- docs, tests, validation reports

Forbidden files:

- unrelated templates/channels
- provider credentials

## Required Work

1. Confirm RabbitMQ or broker transport ownership.
2. Wire `orders.order.lifecycle_changed.v1` and existing Orders events to the router.
3. Use authenticated lookup for PII if needed; do not rely on broadcast full addresses.
4. Add retry/dead-letter behavior or document `[MISSING: retry/DLQ contract]`.

## Validation

- lifecycle event maps to expected notification type
- duplicate event is idempotent
- missing recipient is surfaced as actionable failure
- event payload does not expose full delivery address to unauthorized consumers
