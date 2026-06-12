# Notifications Admin Status

## Current State

Stage: deployed to production and smoke-tested.

## Completed

- Inspected `notifications-microservice`, `docs-rag-microservice`, and RunLayer context on `alfares`.
- Generated a light operations-console design concept.
- Added intent, goal, plan, and status docs under `docs/orchestrator/`.
- Rebuilt `web/admin/index.html` as a full admin console.
- Added guarded message edit support for outbound and inbound records.
- Made frontend config endpoint public for login bootstrap.
- Deployed the service image and forced a Kubernetes rollout restart so the pod pulled the new `latest` image.
- Verified `https://notifications.alfares.cz/admin` serves the new admin console.
- Verified `https://notifications.alfares.cz/api/config` returns browser-safe `https://auth.alfares.cz`.
- Verified in-pod `/health` returns 200.
- Fixed admin login bounce by sourcing notifications `JWT_SECRET` from `secret/prod/auth-microservice` in `k8s/external-secret.yaml`.
- Verified auth test login returns a `global:superadmin` token and all dashboard endpoints return 200.

## Pending

- Authenticate with an admin account and exercise live protected data loads in the browser.

## Risks

- Template management is documented but not implemented as a persisted backend feature. The UI correctly treats templates as inline body plus JSON data.
- Test message action sends real notifications to the selected recipient and therefore requires a browser confirmation.
- `/webhooks/subscriptions` is the implemented route, despite README references to `/api/webhooks/subscriptions`.
- The deploy script sets the deployment image to `:latest`; when the pod template does not change, a manual rollout restart can be required for the new image to run.
- Notifications must verify JWTs with the same secret that auth uses to sign them. If admin login shows the dashboard briefly and then returns to login, compare auth and notifications `JWT_SECRET` fingerprints first.
