# Execution Plan: Goal 05 Operations Deployment Readiness

## Goal

Make notifications-microservice deployment, rollback, secret rotation, and smoke validation repeatable and evidence-driven.

## Workspace

Implementation and validation run on `alfares:/home/ssf/Documents/Github/notifications-microservice`. The local `notifications-remote/` directory is not authoritative.

## Source Evidence

- docs-RAG operations query attempted from inside the running notifications pod and returned `401 Malformed token`; compatible docs-RAG JWT remains unavailable.
- Source evidence is therefore taken from remote repo files: `scripts/deploy.sh`, `k8s/deployment.yaml`, `k8s/configmap.yaml`, `k8s/external-secret.yaml`, `src/health/health.controller.ts`, `src/config/config.controller.ts`, `src/auth/jwt-roles.guard.ts`, `README.md`, `INFRA.md`, and `docs/orchestrator/STATUS.md`.

## Tasks

1. Document deploy, rollback, secret rotation, approval boundaries, and post-deploy smoke in `docs/DEPLOYMENT.md`.
2. Add a non-destructive smoke script that checks public health/config, protected read-only admin endpoints, rollout status, in-pod health, JWT alignment, and expected secret key presence without printing secret values.
3. Correct stale infrastructure documentation about the Kubernetes secret name and link the readiness script/runbook.
4. Validate the script syntax, run build, run read-only smoke checks, and record production deployment status as not deployed.
5. Update the implementation state and Goal 05 validation report with evidence, risks, and next action.

## Boundaries

- No production deploy without explicit owner approval.
- No rollback without explicit owner approval.
- No secret values printed or committed.
- No send/test-send, repair, redelivery, webhook mutation, or mass notification action.
- `/email/inbound/s3` remains public; admin APIs remain protected.
