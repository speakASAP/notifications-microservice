# Coding Prompt: Goal 05 Operations Deployment Readiness

You are working on `alfares:/home/ssf/Documents/Github/notifications-microservice` only.

Implement operations-readiness documentation and non-destructive validation tooling for notifications-microservice.

## Files Owned

- `docs/DEPLOYMENT.md`
- `scripts/smoke-readiness.sh`
- `INFRA.md`
- `implementation-goals/GOAL-05-operations-deployment-readiness.*`
- `docs/IMPLEMENTATION_STATE.md`

## Requirements

- Deployment and rollback steps must match `scripts/deploy.sh` and `k8s/*.yaml`.
- Smoke checks must cover `/health`, `/api/config`, admin auth rejection, protected dashboard/read endpoints, rollout status, in-pod health, delivery-readiness read paths, and secret/JWT alignment without exposing secret values.
- Documentation must state that production deploys, rollbacks, secret rotations, repair actions, and real sends require explicit owner approval.
- Do not deploy, rollback, mutate data, send notifications, or print secrets.

## Validation

Run:

```bash
bash -n scripts/smoke-readiness.sh
npm run build
./scripts/smoke-readiness.sh
```

Record skipped or failing checks in the validation report.
