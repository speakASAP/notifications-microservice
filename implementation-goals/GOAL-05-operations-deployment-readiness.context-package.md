# Context Package: Goal 05 Operations Deployment Readiness

## Remote Evidence

- Remote branch: `feature/notifications-goal-05-operations-deployment-readiness`.
- Remote repo: `alfares:/home/ssf/Documents/Github/notifications-microservice`.
- `scripts/deploy.sh` builds/pushes `<tag>` and `latest`, updates deployment image to `latest`, waits for rollout, and performs an in-pod `/health` check.
- `k8s/deployment.yaml` uses `imagePullPolicy: Always`, one replica, config/secret env sources, and `/health` startup/liveness/readiness probes.
- `k8s/external-secret.yaml` targets `notifications-microservice-secret`; `JWT_SECRET` is sourced from `secret/prod/auth-microservice`.
- `src/auth/jwt-roles.guard.ts` accepts `SERVICE_TOKEN` for protected machine checks and otherwise validates JWT roles.
- `docs/orchestrator/STATUS.md` records prior deployment evidence and the `:latest` pod-template caveat.

## docs-RAG Status

Required docs-RAG query was attempted from inside the running notifications pod for deployment/rollback/smoke/secret-rotation operations readiness. The service returned `401 Malformed token`, so source files were used as the verified basis.

## Known Risks

- Existing remote worktree already contains uncommitted Goal 01-04 changes. Goal 05 work is layered on top of that dirty branch state.
- Deploy script sets the image to `:latest`; an approved rollout restart may still be needed when the pod template is unchanged.
- Secret rotation changes require app restart if environment variables need to be reloaded.
- Delivery catch-up scripts can call downstream webhooks and are intentionally excluded from non-destructive smoke.
