# Notifications Deployment Runbook

This runbook is for `notifications-microservice` on `alfares` in `/home/ssf/Documents/Github/notifications-microservice`.

Production URL: `https://notifications.alfares.cz`  
Admin URL: `https://notifications.alfares.cz/admin`  
Kubernetes namespace: `statex-apps`  
Deployment: `notifications-microservice`  
Container port: `3368`

## Approval Boundary

Production deploys, rollbacks, secret rotations, repair actions, and test sends require explicit owner approval in the current session. Read-only smoke checks are allowed. Do not run mass sends or notification test sends from this runbook.

## Source Evidence

- `scripts/deploy.sh` builds `localhost:5000/notifications-microservice:<tag>` and `:latest`, pushes both tags, sets the Kubernetes deployment image to the immutable `<tag>`, waits for rollout, and checks in-pod `GET /health` with Node `fetch`.
- `k8s/deployment.yaml` runs one replica, uses `imagePullPolicy: Always`, loads `notifications-microservice-config` and `notifications-microservice-secret`, and probes `/health` for startup, liveness, and readiness.
- `k8s/external-secret.yaml` syncs `notifications-microservice-secret` from Vault and sources `JWT_SECRET` from `secret/prod/auth-microservice` so admin JWTs signed by auth validate in notifications.
- `src/health/health.controller.ts` exposes public `GET /health`.
- `src/config/config.controller.ts` exposes public `GET /api/config` for browser-safe auth configuration.
- `src/auth/jwt-roles.guard.ts` protects admin APIs with JWT roles and also accepts the service `SERVICE_TOKEN` for machine smoke checks.

## Pre-Deploy Checklist

Run from the remote repository:

```bash
ssh alfares
cd /home/ssf/Documents/Github/notifications-microservice

git status --short --branch
npm run build
./scripts/smoke-readiness.sh
```

Confirm before deployment:

- `git status` contains only intentional changes for the release.
- `npm run build` passes.
- `./scripts/smoke-readiness.sh` passes or every warning is understood.
- No pending migration, secret, or admin-auth concern is unresolved.
- Owner has explicitly approved the production deployment.

## Deploy

Use the repository deploy script after approval:

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && ./scripts/deploy.sh'
```

To deploy a specific traceable tag:

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && ./scripts/deploy.sh <image-tag>'
```

Expected script behavior:

1. Build Docker image tagged as `localhost:5000/notifications-microservice:<tag>` and `localhost:5000/notifications-microservice:latest`.
2. Push both tags to the local registry.
3. Run `kubectl set image deployment/notifications-microservice app=localhost:5000/notifications-microservice:<tag> -n statex-apps`.
4. Wait for rollout with a 180 second timeout.
5. Run in-pod `GET /health` on `127.0.0.1:3368`.

The deployment image field should point at the immutable tag from the deploy
run. If the runtime image ever points back to `:latest`, repin the exact
approved tag before relying on readiness evidence:

```bash
ssh alfares 'kubectl set image deployment/notifications-microservice app=localhost:5000/notifications-microservice:<tag> -n statex-apps && kubectl rollout status deployment/notifications-microservice -n statex-apps --timeout=180s'
```

## Post-Deploy Smoke

Run the non-destructive smoke script:

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && ./scripts/smoke-readiness.sh'
```

The smoke covers:

- public `GET /health`;
- public `GET /api/config`;
- unauthenticated rejection for `GET /admin/stats`;
- Kubernetes rollout status;
- in-pod `GET /health`;
- protected read-only admin/dashboard endpoints using `SERVICE_TOKEN` without printing the token;
- JWT secret alignment between notifications and auth Kubernetes secrets when both are readable;
- presence checks for expected secret keys without printing secret values.

Read-only protected endpoints checked by the script:

- `GET /admin/stats`
- `GET /admin/history?limit=5`
- `GET /admin/params`
- `GET /admin/channels`
- `GET /email/inbound?limit=5&listOnly=1`
- `GET /email/inbound/undelivered-count`
- `GET /webhooks/subscriptions`

## Rollback

Rollback requires owner approval. First inspect rollout history:

```bash
ssh alfares 'kubectl rollout history deployment/notifications-microservice -n statex-apps'
```

Rollback to the previous ReplicaSet:

```bash
ssh alfares 'kubectl rollout undo deployment/notifications-microservice -n statex-apps && kubectl rollout status deployment/notifications-microservice -n statex-apps --timeout=180s'
```

Rollback to a specific revision:

```bash
ssh alfares 'kubectl rollout undo deployment/notifications-microservice -n statex-apps --to-revision=<revision> && kubectl rollout status deployment/notifications-microservice -n statex-apps --timeout=180s'
```

After rollback, run:

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && ./scripts/smoke-readiness.sh'
```

If rollback is needed, use the previous immutable image tag or Kubernetes
rollout undo, then compare the running pod image ID before and after the
rollback:

```bash
ssh alfares 'kubectl get pod -n statex-apps -l app=notifications-microservice -o jsonpath="{.items[0].status.containerStatuses[0].imageID}{\n}"'
```

## Secret Rotation

Secrets live in Vault and are synced by External Secrets. Do not put secret values in Git, runbooks, screenshots, terminal reports, or frontend code.

Manifest source of truth:

- ConfigMap: `k8s/configmap.yaml`
- ExternalSecret: `k8s/external-secret.yaml`
- Kubernetes Secret target: `notifications-microservice-secret`
- Notifications Vault path: `secret/prod/notifications-microservice`
- JWT signing secret source: `secret/prod/auth-microservice` property `JWT_SECRET`

Rotation procedure after owner approval:

1. Rotate the value in Vault at the referenced path/property.
2. Wait at least one ExternalSecret refresh interval, currently `5m`, or reconcile the ExternalSecret through the cluster operator workflow.
3. Verify only key presence and alignment, not values:

```bash
ssh alfares 'kubectl get externalsecret notifications-microservice-secret -n statex-apps'
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && ./scripts/smoke-readiness.sh'
```

4. Restart the deployment if the application must reload environment variables:

```bash
ssh alfares 'kubectl rollout restart deployment/notifications-microservice -n statex-apps && kubectl rollout status deployment/notifications-microservice -n statex-apps --timeout=180s'
```

5. Run post-rotation smoke again.

JWT rotation must keep auth signing and notifications verification aligned. `k8s/external-secret.yaml` intentionally maps notifications `JWT_SECRET` from the auth service Vault path. If admin login redirects back to login or protected dashboard calls return 401, verify this alignment first without printing values.

## Delivery Path Checks

The standard smoke is read-only. Delivery repair and catch-up commands can call downstream webhooks and require explicit owner approval:

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && ./scripts/check-undelivered-to-helpdesk.sh'
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && ./scripts/drain-all-undelivered.sh'
```

Use these only when the operational intent is to inspect or redeliver inbound messages.
