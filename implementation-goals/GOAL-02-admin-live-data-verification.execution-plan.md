# GOAL-02 Execution Plan: Admin Live Data Verification

## Goal

Verify that the notifications admin console can load protected live data with valid admin-equivalent authentication, and record evidence or blockers.

## Intent

Preserve the notifications microservice as a guarded operations console for outbound notifications, inbound email, channel policy, and webhook delivery. Verification must not send notifications, mutate customer message data, expose secrets, or weaken admin JWT protections.

## Scope

- Confirm admin data endpoints used by `web/admin/index.html`.
- Confirm protected routes reject unauthenticated requests.
- Exercise live protected reads with a valid token.
- Attempt required docs-RAG lookup and record the result.
- Record durable evidence in a validation report and implementation state.

## Out Of Scope

- Browser test sends or any real notification sends.
- Message, channel, inbound email, or webhook mutation flows.
- Deployment.
- Auth service changes.
- Template-management implementation.

## Files To Read First

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
- `web/admin/index.html`
- `src/admin/admin.controller.ts`
- `src/email/inbound-email.controller.ts`
- `src/email/webhook-subscription.controller.ts`
- `src/auth/jwt-roles.guard.ts`
- `src/app.module.ts`

## Files Allowed To Change

- `implementation-goals/GOAL-02-admin-live-data-verification.execution-plan.md`
- `implementation-goals/GOAL-02-admin-live-data-verification.context-package.md`
- `implementation-goals/GOAL-02-admin-live-data-verification.coding-prompt.md`
- `implementation-goals/GOAL-02-admin-live-data-verification.validation-report.md`
- `docs/IMPLEMENTATION_STATE.md`

## Files Not To Change

- Vault or Kubernetes secret values.
- `web/admin/index.html` unless a verified admin data-load defect is found.
- Backend controllers/services unless a verified admin data-load defect is found.
- Provider send implementations.
- Public behavior of `/email/inbound/s3`.

## Tasks

1. Inspect the admin UI calls and backend route protection.
2. Exercise protected admin read endpoints with a valid token without printing token values.
3. Exercise the same endpoint set without a token to verify protection remains active.
4. Attempt docs-RAG retrieval for the admin endpoint context and record success or blocker.
5. Record validation evidence, gaps, risks, changed files, and next action.

## Acceptance Criteria

- Protected admin data loads are exercised with a valid admin-equivalent token or a blocker is recorded with concrete failure evidence.
- Dashboard endpoints needed by the admin console return expected status codes.
- No real notifications are sent.
- Evidence is recorded in a validation report and `docs/IMPLEMENTATION_STATE.md`.

## Validation Commands

- `ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && git status --short --branch'`
- Protected endpoint smoke using `SERVICE_TOKEN` from the running pod without printing the token.
- Unauthenticated endpoint smoke for the same read endpoints.
- docs-RAG retrieval attempt from inside the running pod.

## Risks

- A machine token proves guarded route access but does not fully prove a human admin browser login.
- docs-RAG rejected `SERVICE_TOKEN` with `401 Malformed token`; the correct docs-RAG JWT was not available in this session.
- Live API evidence must avoid raw message bodies, recipient identifiers, and token values.

## Owner Checkpoints

- Human browser login with a real admin account remains optional owner-side follow-up if machine-token API evidence is insufficient.
