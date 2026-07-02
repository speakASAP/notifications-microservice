# Notifications Admin Status

## 2026-07-01 - Cliplot Notification Identity Readiness

Intent: allow Cliplot to authenticate to Notifications for future transactional
order-confirmation notifications without sending a real notification in this
lane.

Change: `JwtRolesGuard` now accepts only the Vault-projected
`CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN` as a `cliplot` machine actor with
`internal:notifications-microservice:admin`. The existing `SERVICE_TOKEN`
machine path is preserved and now uses constant-time comparison. The token is
projected from `secret/prod/cliplot#NOTIFICATIONS_SERVICE_TOKEN`
through `notifications-microservice-secret`.

Boundary decision: no notification send, test-send, mass send, channel mutation,
template persistence, webhook delivery, or customer contact action is performed
in this lane. Validation uses unit tests, server dry-run, deploy, and an
invalid-body Cliplot smoke that must stop before provider send.

Validation evidence: focused `npm test -- --runInBand src/auth/jwt-roles.guard.spec.ts`
passed with 4 tests; `npm run build` passed; `git diff --check` passed;
Kubernetes server dry-run passed for `k8s/external-secret.yaml`. Runtime deploy
completed with image `localhost:5000/notifications-microservice:485ef45`.
Because the deploy script only updated the image, `k8s/external-secret.yaml`
was applied separately, `notifications-microservice-secret` force-synced, and
`deployment/notifications-microservice` was restarted so the pod picked up
`CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN`. Safe invalid-body smoke from the Cliplot
pod to `POST /notifications/send` moved from HTTP `401 Invalid token` to HTTP
`500 SEND_FAILED`, proving Cliplot service-token auth reached the send path
without a valid notification payload. No valid notification send was executed.

Cliplot GOAL-05 notification validation support: `POST /notifications/validate`
is deployed as a protected no-send preflight for consumers that need to
prove notification payload shape and channel policy before using
`POST /notifications/send`. The endpoint uses the existing notification DTO and
channel policy resolution, returns `mutation=false` and `providerCall=false`,
and must not create notification rows or call SES, SendGrid, Telegram, or
WhatsApp providers.

Runtime evidence after commit `bacdfb4`: deployment was restarted because the
deploy script keeps the Kubernetes image field at `:latest`; public unauthenticated
`POST /notifications/validate` returned HTTP `401`, and a Cliplot pod request
using the projected `NOTIFICATIONS_SERVICE_TOKEN` returned HTTP `201` with
`success=true`, `mutation=false`, `providerCall=false`, `channel=email`, and
`decisionReason=legacy_fallback_no_channel_key`. No notification row was
created and no provider send was requested by the validate endpoint.

## Current State

## 2026-07-02 - Immutable Deploy Tag Hardening

Intent: keep invoice document notification readiness stable by preventing
future deploys from leaving the Kubernetes deployment on a stale or ambiguous
`:latest` image.

Change:
- `scripts/deploy.sh` still builds and pushes both the requested tag and
  `:latest`, but now sets the Kubernetes deployment image to the immutable
  requested tag.
- `docs/DEPLOYMENT.md` now documents immutable deploy tags and the recovery
  command for repinning if the runtime ever drifts back to `:latest`.

Runtime evidence:
- Before this source hardening, live deployment was already repinned to
  `localhost:5000/notifications-microservice:f855764`.
- `./scripts/check-invoices-documents-readiness.sh` passed for proforma and
  final invoice validation with HTTP 201, `mutation=false`, and
  `providerCall=false`.

Boundary decision: no deploy was run for this source hardening, no
`/notifications/send` was called, no provider dispatch occurred, no
`channel_registry` mutation was made, and no customer contact was performed.

## 2026-07-02 - Invoices Documents Runtime Readiness Complete

Intent: complete the approved Notifications-side runtime provisioning for
invoice document delivery while preserving the no-send/customer-contact
boundary.

Runtime changes:
- Verified Vault path `secret/prod/invoices-microservice` already contains
  `NOTIFICATIONS_SERVICE_TOKEN`; no secret value was printed.
- Applied `k8s/external-secret.yaml` and force-synced
  `notifications-microservice-secret`; `INVOICES_NOTIFICATIONS_SERVICE_TOKEN`
  is now present in the Kubernetes Secret.
- Seeded `channel_registry` with `channelKey=invoices.documents`, `type=email`,
  `provider=ses`, `isActive=true`, `purposesAllowed={transactional}`, and
  `applicationsAllowed={invoices-microservice}`. Sender fields remain `NULL`
  so provider defaults apply.
- Deployed integration branch `codex/notifications-orders-lifecycle-integration`
  at commit `a73df0b`; image digest
  `sha256:4e12aef822773d9ffec333db6417403ac6b5a73cf855ab8e25fb2bcb664f25a1`.
- Because the deploy script leaves the deployment image at `:latest`, an
  explicit rollout restart was required. Final ready pod
  `notifications-microservice-64ff99b44f-jdvpx` runs the new digest above.

Validation:
- 2026-07-02 pre-deploy `git diff --check` passed on the integration branch.
- 2026-07-02 pre-deploy `npm run build` passed on the integration branch.
- 2026-07-02 pre-deploy `npm test -- --runInBand` passed (7 suites, 32 tests).
- 2026-07-02 `./scripts/deploy.sh` completed successfully and in-pod `/health`
  passed.
- 2026-07-02 `./scripts/check-invoices-documents-readiness.sh` passed:
  proforma and final invoice payloads both returned HTTP 201 with
  `mutation=false` and `providerCall=false`.
- 2026-07-02 smoke recipient `invoice-smoke@example.invalid` notification rows
  stayed `0 -> 0`, confirming the readiness script did not persist a
  notification row.

Boundary decision: no real `/notifications/send`, provider dispatch, template
persistence, webhook delivery, customer data mutation, or customer contact
action was performed. The only live data mutation was the approved
`channel_registry` policy row.

Remaining caveat:
- `[UNKNOWN: Approved invoice sender identity if provider defaults are not acceptable]`


## 2026-07-02 - Invoices Documents Channel Contract Readiness

Intent: finish the Notifications-side source contract for proforma/final invoice
message delivery while preserving the no-send boundary.

Change: added the durable contract doc
`docs/orchestrator/INVOICES_DOCUMENTS_NOTIFICATION_CONTRACT.md`, focused unit
tests for `channelKey=invoices.documents` policy resolution, and the
non-destructive runtime check `scripts/check-invoices-documents-readiness.sh`.
The readiness script uses only `POST /notifications/validate` with
`invoice-smoke@example.invalid` and requires `mutation=false` plus
`providerCall=false`; it does not call `/notifications/send`.

Contract decision: Notifications does not need a persisted invoice template for
this lane. Invoices supplies inline `message`, `subject`, and bounded
`templateData.invoice`; Notifications must provide auth plus a channel policy
row allowing `service=invoices-microservice` and `purpose=transactional` on
`channelKey=invoices.documents`.

Boundary decision: no notification send, provider dispatch, channel mutation,
secret write, live deploy, template persistence, webhook delivery, customer data
mutation, or customer contact action was performed.

Runtime blockers at source-lane handoff, now resolved by the runtime readiness section above:
- Vault value `secret/prod/invoices-microservice#NOTIFICATIONS_SERVICE_TOKEN` exists and is synced into `notifications-microservice-secret`.
- Runtime `channel_registry` row for `invoices.documents` exists and allows `invoices-microservice` with `transactional` purpose.
- `scripts/check-invoices-documents-readiness.sh` passed against live Notifications.
- `[UNKNOWN: Approved invoice sender identity if provider defaults are not acceptable]`

Validation:
- 2026-07-02 docs-RAG query from `alfares` for the invoice notification
  contract failed with DNS `Could not resolve host: docs-rag-microservice.statex-apps.svc.cluster.local`.
- 2026-07-02 `bash -n scripts/check-invoices-documents-readiness.sh` passed.
- 2026-07-02 focused `npm test -- --runInBand src/notifications/channel-registry.service.spec.ts src/notifications/notifications.service.spec.ts` passed (2 suites, 7 tests).
- 2026-07-02 `npm run build` passed.
- 2026-07-02 full `npm test -- --runInBand` passed (7 suites, 31 tests).
- 2026-07-02 `git diff --check` passed.
- Live `./scripts/check-invoices-documents-readiness.sh` was not run because
  runtime provisioning reported `channel_registry` has 0 rows and this lane is
  forbidden from mutating channel rows.


## 2026-07-02 - Invoices Notification Identity Readiness

Intent: allow `invoices-microservice` to authenticate to Notifications for
future proforma/final invoice delivery without sending a real notification in
this lane.

Change: `JwtRolesGuard` now accepts the Vault-projected
`INVOICES_NOTIFICATIONS_SERVICE_TOKEN` as an `invoices-microservice` machine
actor with `internal:notifications-microservice:admin`. The token is projected
from `secret/prod/invoices-microservice#NOTIFICATIONS_SERVICE_TOKEN` through
`notifications-microservice-secret`.

Boundary decision: no notification send, validate call, channel mutation,
template persistence, webhook delivery, or customer contact action is performed
in this lane. The channel policy row for `invoices.documents` remains a
separate runtime/configuration blocker.

Deployment gate: do not apply the updated ExternalSecret to a live environment
until `secret/prod/invoices-microservice#NOTIFICATIONS_SERVICE_TOKEN` exists.

Validation:
- 2026-07-02 `npm test -- --runInBand src/auth/jwt-roles.guard.spec.ts` passed
  (5/5 tests).
- 2026-07-02 `npm run build` passed.
- 2026-07-02 `npm test -- --runInBand` passed (6 suites, 26 tests).
- 2026-07-02 `git diff --check` passed.
- 2026-07-02 Kubernetes server dry-run for `k8s/external-secret.yaml` in
  `statex-apps` passed.

Stage: Goal 7.4 Orders events contract boundary implemented and validated, including `orders.order.lifecycle_changed.v1`; live broker consumption not deployed.

## Goal 7.4 Orders Events Integration Status

- Verified Notifications repo started clean on `main` at `86b7da9`.
- Verified Orders publishes canonical RabbitMQ lifecycle events on `orders.events` with routing keys `orders.order.created.v1`, `orders.order.updated.v1`, `orders.order.paid.v1`, `orders.order.shipped.v1`, `orders.order.cancelled.v1`, and `orders.order.lifecycle_changed.v1`.
- Verified Notifications exposes existing HTTP `/notifications/send` and no existing Orders RabbitMQ consumer was present.
- Added a Notifications-owned Orders event DTO validator and router that maps valid Orders events, including lifecycle-changed events, to the existing send path.
- Added event-id idempotency by checking existing notification `templateData.ordersEvent.eventId` before sending.
- Added bounded metadata only; customer, address, payment method, tracking, token, secret, and credential fields are rejected.
- Added focused unit/contract tests for routing, idempotency, dedupe, missing-recipient blocking, and sensitive payload rejection.
- Deployment not run. Runtime broker and recipient config are still missing.
- Validation passed: focused Jest spec, `npm run build`, full `npm test`, and `git diff --check`. 2026-07-02 branch update passed the focused Orders event router spec (6 tests), `npm run build`, full `npm test -- --runInBand` (6 suites / 26 tests), and `git diff --check`.
- Runtime ConfigMap key-name audit found no `RABBIT*` or `ORDERS_EVENTS*` keys.
- Runtime Secret key-name audit found no `RABBIT*` or `ORDERS_EVENTS*` keys.
- Secret values were not printed.
- Final deployment is blocked until live consumer and recipient config contracts are approved.

## Goal 7.4 Blockers

- `[MISSING: Notifications-owned RabbitMQ consumer module or approved transport dependency]`
- `[MISSING: Notifications runtime RABBITMQ_URL or broker secret source]`
- `[MISSING: Orders-events queue name, binding ownership, dead-letter/retry policy, and deployment owner]`
- `[MISSING: Production value for ORDERS_EVENTS_NOTIFICATION_RECIPIENT or an approved channel-registry route that provides a recipient]`
- `[MISSING: Deployment approval after validation and runtime config confirmation]`

## Prior Current State

Stage: deployed to production and smoke-tested for the admin frontend goal.

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
- Historical deployments that used `:latest` could leave stale pod digests; current deploy script source now pins the immutable requested image tag.
- Notifications must verify JWTs with the same secret that auth uses to sign them. If admin login shows the dashboard briefly and then returns to login, compare auth and notifications `JWT_SECRET` fingerprints first.
