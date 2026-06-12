# GOAL-03: Delivery Reliability

## Objective

Harden outbound notification delivery, inbound email processing, webhook delivery, deduplication, retry, and repair behavior.

## Scope

- `src/notifications/*`
- `src/email/*`
- delivery status transitions;
- webhook retry and confirmation behavior;
- idempotency/deduplication;
- repair endpoints and admin visibility;
- tests for changed behavior.

## Acceptance Criteria

- Delivery state transitions are explicit and testable.
- Duplicate messages are suppressed without hiding actionable failure details.
- Retry/repair actions are guarded and observable.
- Webhook delivery failures surface enough evidence for operators.
- Tests or documented smoke checks cover changed behavior.

## Validation

- `npm run test`
- `npm run build`
- Targeted API smoke for changed delivery/repair routes.

## Done Report

Use the required Intent Compliance Report from `implementation-goals/README.md`.
