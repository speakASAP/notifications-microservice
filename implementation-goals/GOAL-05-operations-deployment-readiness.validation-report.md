# Validation Report: Goal 05 Operations Deployment Readiness

## Goal

Make notifications-microservice deployment, rollback, secret rotation, and smoke validation repeatable and evidence-driven.

## Remote Workspace

All implementation and validation were performed on `alfares:/home/ssf/Documents/Github/notifications-microservice`.

Remote branch: `feature/notifications-goal-05-operations-deployment-readiness`.

## Implemented

- Added `docs/DEPLOYMENT.md` with approval boundaries, deploy steps, post-deploy smoke, rollback, secret rotation, JWT alignment guidance, and delivery-path cautions.
- Added `scripts/smoke-readiness.sh`, a non-destructive production readiness smoke script.
- Updated `INFRA.md` to use the correct Kubernetes secret target name and point to the readiness smoke/runbook.
- Added Goal 05 execution plan, context package, and coding prompt.

## Source Evidence

- docs-RAG operations query was attempted from inside the running notifications pod and returned `401 Malformed token`; no compatible docs-RAG JWT was available.
- Deployment evidence came from `scripts/deploy.sh` and `k8s/deployment.yaml`.
- Secret/Vault evidence came from `k8s/external-secret.yaml` and `INFRA.md`.
- Smoke endpoint evidence came from `src/health/health.controller.ts`, `src/config/config.controller.ts`, and `src/auth/jwt-roles.guard.ts`.
- Prior production caveat evidence came from `docs/orchestrator/STATUS.md`, especially the `:latest` rollout restart note.

## Validation Commands

```bash
bash -n scripts/smoke-readiness.sh
npm run build
./scripts/smoke-readiness.sh
```

## Validation Results

- `bash -n scripts/smoke-readiness.sh`: passed.
- `npm run build`: passed.
- `./scripts/smoke-readiness.sh`: passed.

Smoke evidence from the run:

- Public `GET /health`: HTTP 200.
- Public `GET /api/config`: HTTP 200.
- Unauthenticated `GET /admin/stats`: HTTP 401.
- Kubernetes rollout status: complete.
- In-pod `GET /health`: success.
- Protected `GET /admin/stats`: HTTP 200 with `SERVICE_TOKEN`.
- Protected `GET /admin/history?limit=5`: HTTP 200 with `SERVICE_TOKEN`.
- Protected `GET /admin/params`: HTTP 200 with `SERVICE_TOKEN`.
- Protected `GET /admin/channels`: HTTP 200 with `SERVICE_TOKEN`.
- Protected `GET /email/inbound?limit=5&listOnly=1`: HTTP 200 with `SERVICE_TOKEN`.
- Protected `GET /email/inbound/undelivered-count`: HTTP 200 with `SERVICE_TOKEN`.
- Protected `GET /webhooks/subscriptions`: HTTP 200 with `SERVICE_TOKEN`.
- JWT secret data matched between notifications and auth Kubernetes secrets.
- Expected secret keys were present; no secret values were printed.

## Deployment Evidence

Production deployment was approved by the owner and performed on 2026-06-12.

- Command: `./scripts/deploy.sh`.
- Built and pushed `localhost:5000/notifications-microservice:a56270f` and `localhost:5000/notifications-microservice:latest`.
- Pushed digest: `sha256:22f9f67a55df3c7d663291e7e0578a9c553aa8bc3e3c29d507ac3556cd8831f6`.
- Deploy script rollout and in-pod `/health` check passed.
- Because the deployment image field uses `:latest`, the first rollout left the pod on prior digest `sha256:97745eb2e9313586fa66006e3dc50207bfd0ea1770c88cdf73201ccf71f50528`.
- Ran approved `kubectl rollout restart deployment/notifications-microservice -n statex-apps` and waited for rollout success.
- Final running pod: `notifications-microservice-c8f755679-gxnfr`.
- Final running image digest: `sha256:22f9f67a55df3c7d663291e7e0578a9c553aa8bc3e3c29d507ac3556cd8831f6`.
- Final post-deploy `./scripts/smoke-readiness.sh` passed.

## Not Run

- No rollback.
- No secret rotation.
- No send/test-send, repair, redelivery, webhook mutation, or mass notification action.

## Risks

- The remote worktree already contained uncommitted Goal 01-04 changes before Goal 05 started. Goal 05 changes are layered on that state.
- The deploy script still sets the deployment image to `:latest`; a rollout restart may be required after an approved deploy if the pod template does not change.
- Delivery catch-up scripts can call downstream webhooks and remain outside non-destructive smoke.
- docs-RAG remains blocked until a compatible JWT is supplied.

## Intent Compliance Report

### Goal

Goal 05 Operations Deployment Readiness.

### Implemented

Deployment runbook, rollback procedure, secret rotation guidance, JWT alignment checks, non-destructive smoke script, and updated Goal 05 orchestration artifacts.

### Not Implemented

Production deploy was performed after owner approval. No rollback, secret rotation, real send, repair, redelivery, or data mutation was performed.

### Boundary Check

Admin protections are preserved; `/email/inbound/s3` behavior was not changed; no secrets were exposed; production changes still require explicit owner approval.

### Workers Used

None.

### Validation Evidence

`bash -n scripts/smoke-readiness.sh`, `npm run build`, pre-deploy `./scripts/smoke-readiness.sh`, deploy script health check, rollout restart, and final post-deploy `./scripts/smoke-readiness.sh` all passed on `alfares`.

### Risks

Remote worktree has accumulated uncommitted prior-goal changes; docs-RAG JWT remains unavailable; deploy script uses `:latest`, and the approved rollout restart was required to run the new digest.

### Files Changed

- `INFRA.md`
- `docs/DEPLOYMENT.md`
- `scripts/smoke-readiness.sh`
- `implementation-goals/GOAL-05-operations-deployment-readiness.execution-plan.md`
- `implementation-goals/GOAL-05-operations-deployment-readiness.context-package.md`
- `implementation-goals/GOAL-05-operations-deployment-readiness.coding-prompt.md`
- `implementation-goals/GOAL-05-operations-deployment-readiness.validation-report.md`
- `docs/IMPLEMENTATION_STATE.md`

### Next Action

Owner decision: whether to commit the accumulated Goal 01-05 changes. Production is running digest `sha256:22f9f67a55df3c7d663291e7e0578a9c553aa8bc3e3c29d507ac3556cd8831f6`.
