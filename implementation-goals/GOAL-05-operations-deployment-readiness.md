# GOAL-05: Operations Deployment Readiness

## Objective

Make notifications-microservice deployment, rollback, secret rotation, and smoke validation repeatable and evidence-driven.

## Scope

- Deployment runbook and scripts.
- Health checks and rollout checks.
- Secret/Vault references and JWT secret alignment checks.
- Production smoke checklist.
- Rollback procedure.

## Acceptance Criteria

- Deploy and rollback steps are documented and match the repo scripts/manifests.
- Smoke checks cover `/health`, `/api/config`, admin auth, protected dashboard endpoints, and relevant delivery paths.
- Secret rotation guidance does not expose secret values.
- Production changes require explicit owner approval.

## Validation

- docs-rag or source evidence for deployment behavior.
- `npm run build` if scripts or code change.
- Non-destructive smoke commands where appropriate.

## Done Report

Use the required Intent Compliance Report from `implementation-goals/README.md`.
