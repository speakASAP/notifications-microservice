# GOAL-03 Execution Plan: Delivery Reliability

## Goal

Harden delivery reliability for outbound notifications, inbound processing, and webhook delivery state so operators can see explicit state transitions and actionable failure evidence.

## Intent

Preserve the notifications microservice as the guarded operations control point for Statex communications. Reliability changes must improve observability and repairability without sending real notifications, weakening auth, changing public S3 inbound compatibility, or exposing secrets/customer content in reports.

## Scope

- Inspect outbound notification idempotency and status transitions.
- Inspect inbound email processing, repair, deduplication, and redelivery paths.
- Implement a bounded reliability improvement where evidence is currently weak.
- Add tests for changed behavior.
- Record validation evidence and remaining risks.

## Out Of Scope

- Production deployment without explicit owner request.
- Mass sends or real test sends.
- Schema migrations unless strictly required for the bounded reliability fix.
- Template-management feature work.
- Channel policy UX work assigned to Goal 04.

## Files To Read First

- `implementation-goals/GOAL-03-delivery-reliability.md`
- `docs/IMPLEMENTATION_STATE.md`
- `docs/orchestrator/INTENT.md`
- `docs/orchestrator/GOALS.md`
- `docs/orchestrator/PLAN.md`
- `docs/orchestrator/STATUS.md`
- `src/notifications/notifications.service.ts`
- `src/email/inbound-email.service.ts`
- `src/email/inbound-email.controller.ts`
- `src/email/webhook-delivery.service.ts`
- `src/email/entities/webhook-delivery.entity.ts`
- `src/email/entities/webhook-subscription.entity.ts`

## Files Allowed To Change

- `src/email/webhook-delivery.service.ts`
- `src/email/webhook-delivery.service.spec.ts`
- `implementation-goals/GOAL-03-delivery-reliability.*.md`
- `docs/IMPLEMENTATION_STATE.md`

## Files Not To Change

- Vault or Kubernetes secret values.
- Provider send implementations.
- Public `/email/inbound/s3` behavior.
- Auth guard behavior.
- Channel registry policy UX and template-management docs except as Goal 04 follow-up notes.

## Tasks

1. Create Goal 03 planning and context artifacts.
2. Add explicit webhook delivery failure records when a matched subscription cannot be delivered.
3. Keep filter skips non-failures.
4. Preserve subscription retry counters, timeout backoff, and alert behavior.
5. Add unit tests covering delivered, failed, and health-failed evidence rows.
6. Run targeted tests and build.
7. Record validation evidence and next action.

## Acceptance Criteria

- Delivery state transitions are explicit and testable.
- Duplicate suppression behavior is not weakened.
- Retry/repair actions remain guarded and observable.
- Webhook delivery failures surface enough evidence for operators.
- Tests or documented smoke checks cover changed behavior.

## Validation Commands

- `npm run test -- webhook-delivery.service.spec.ts`
- `npm run build`
- Read-only API smoke for relevant protected admin/repair visibility endpoints if practical.

## Risks

- Existing repository has uncommitted orchestrator bootstrap files; preserve them.
- docs-RAG remains blocked without a compatible JWT.
- Webhook tests should not make network calls or send email.

## Owner Checkpoints

- Production deploy requires explicit owner approval.
