# GOAL-02 Context Package: Admin Live Data Verification

## Goal

Verify protected live data loading for the notifications admin console and record durable evidence.

## Source Documents

- `AGENTS.md`
- `README.md`
- `docs/IMPLEMENTATION_STATE.md`
- `docs/IMPLEMENTATION_ORCHESTRATOR.md`
- `implementation-goals/README.md`
- `implementation-goals/GOAL-02-admin-live-data-verification.md`
- `docs/orchestrator/INTENT.md`
- `docs/orchestrator/GOALS.md`
- `docs/orchestrator/PLAN.md`
- `docs/orchestrator/STATUS.md`

## Current State

- Goal 00 admin console implementation is deployed.
- Goal 01 orchestrator operating model is complete.
- Goal 02 was ready and is now validated with machine-token protected API evidence.
- No production deployment was requested or performed for Goal 02.

## Relevant Code Paths

- `web/admin/index.html`
  - Uses same-origin `api()` helper with `Authorization: Bearer <token>`.
  - Loads `/admin/stats`, `/admin/channels`, `/admin/history`, `/admin/params`, `/webhooks/subscriptions`, and `/email/inbound`.
  - Contains mutation and repair actions, but Goal 02 did not execute them.
- `src/app.module.ts`
  - Registers `JwtRolesGuard` as global `APP_GUARD`.
- `src/auth/jwt-roles.guard.ts`
  - Requires Bearer auth unless a route is marked `@Public`.
  - Allows `SERVICE_TOKEN` as an admin-equivalent machine credential.
  - Requires `global:superadmin` or `internal:notifications-microservice:admin` by default.
- `src/admin/admin.controller.ts`
  - Provides protected admin stats, history, params, channels, and message detail/edit routes.
- `src/email/inbound-email.controller.ts`
  - Provides protected inbound email list/detail/repair routes except explicitly public compatibility endpoints where applicable.
- `src/email/webhook-subscription.controller.ts`
  - Provides webhook subscription read and mutation routes under the global guard.

## Product Constraints

- Do not send mass notifications.
- Do not perform test sends without explicit owner confirmation.
- Do not expose secrets in frontend, docs, logs, screenshots, or reports.
- Keep admin APIs protected by JWT role guard.
- Preserve `/email/inbound/s3` compatibility behavior.

## Operational Constraints

- Authoritative implementation workspace: `alfares:/home/ssf/Documents/Github/notifications-microservice`.
- Production admin URL: `https://notifications.alfares.cz/admin`.
- Production API URL: `https://notifications.alfares.cz`.
- Deploy only after explicit owner approval or direct request.

## Acceptance Criteria

- Protected admin data loads are exercised with a valid admin-equivalent token or a blocker is recorded.
- Dashboard endpoints needed by the admin console return expected status codes.
- No real notifications are sent.
- Evidence is recorded in a validation report and implementation state.

## Known Risks

- Machine-token verification does not fully prove human admin login UX.
- docs-RAG lookup could not be completed because the available token was rejected.
- Webhook subscription and channel lists can legitimately be empty.

## Questions Or Blockers

- docs-RAG endpoint returned `401 Malformed token` when called from inside the notifications pod with `SERVICE_TOKEN`.
- Owner may choose to run a human admin browser login as an additional check.
