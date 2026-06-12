# GOAL-03 Context Package: Delivery Reliability

## Goal

Improve reliability evidence and testability for notification delivery, especially inbound email webhook delivery failures.

## Source Documents

- `docs/IMPLEMENTATION_STATE.md`
- `docs/IMPLEMENTATION_ORCHESTRATOR.md`
- `implementation-goals/README.md`
- `implementation-goals/GOAL-03-delivery-reliability.md`
- `docs/orchestrator/INTENT.md`
- `docs/orchestrator/GOALS.md`
- `docs/orchestrator/PLAN.md`
- `docs/orchestrator/STATUS.md`

## Current State

- Goal 02 verified protected admin read endpoints.
- Wave 2 is ready.
- Goal 03 branch: `feature/notifications-goal-03-delivery-reliability`.
- Remote authoritative workspace: `alfares:/home/ssf/Documents/Github/notifications-microservice`.

## Relevant Code Paths

- `src/notifications/notifications.service.ts`
  - Creates outbound rows as `pending`.
  - Marks successful sends `sent`.
  - Marks provider errors `failed` and stores error text.
  - Suppresses duplicate recent `sent` or `pending` messages.
- `src/email/inbound-email.service.ts`
  - Stores inbound emails as `pending`.
  - `processInboundEmail` marks `processed` or `failed`.
  - S3 duplicate handling avoids duplicate webhook sends.
  - Repair/reparse paths avoid duplicate helpdesk tickets.
- `src/email/webhook-delivery.service.ts`
  - Sends inbound emails to active webhook subscriptions.
  - Records success rows in `webhook_deliveries`.
  - Current gap: failure paths update subscription counters but do not always create `webhook_deliveries` evidence rows.
- `src/email/inbound-email.controller.ts`
  - Exposes guarded repair and undelivered visibility routes under the global auth guard.
- `src/app.module.ts`
  - Registers `JwtRolesGuard` globally.

## Product Constraints

- No real notification sends without explicit approval.
- No raw customer messages, recipients, token values, or secrets in reports.
- Admin repair routes must remain guarded.
- Public `/email/inbound/s3` compatibility must remain intact.

## Operational Constraints

- Do implementation, tests, and build on `alfares`.
- Do not deploy without explicit owner approval.
- docs-RAG lookup is required by process, but the available notifications `SERVICE_TOKEN` returned `401 Malformed token`; record this blocker if it persists.

## Acceptance Criteria

- Delivery state transitions are explicit and testable.
- Duplicate messages are suppressed without hiding actionable failure details.
- Retry/repair actions are guarded and observable.
- Webhook delivery failures surface enough evidence for operators.
- Tests or documented smoke checks cover changed behavior.

## Known Risks

- A complete delivery reliability hardening could span multiple modules; this slice focuses on the highest-confidence gap with test coverage.
- Existing uncommitted orchestrator files are present in the remote worktree and must be preserved.

## Questions Or Blockers

- Compatible docs-RAG JWT is not available.
- Owner approval is required before any deploy.
