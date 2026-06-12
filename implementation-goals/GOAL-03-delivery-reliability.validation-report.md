# GOAL-03 Validation Report: Delivery Reliability

## Goal

Harden delivery reliability and observability for notifications-microservice delivery flows.

## Scope Validated

- Webhook delivery state transitions for successful and failed inbound email webhook attempts.
- Failure evidence rows in `webhook_deliveries`.
- Filter non-match behavior remains a skip, not a failure.
- Existing guarded delivery visibility endpoints remain reachable with admin-equivalent auth.
- Build and test coverage for changed behavior.

## Commands Run

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && npm run test -- webhook-delivery.service.spec.ts'
```

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && npm run test'
```

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && npm run build'
```

```bash
ssh alfares 'TOKEN=$(kubectl exec -n statex-apps deploy/notifications-microservice -- printenv SERVICE_TOKEN 2>/dev/null | tr -d "\r"); for path in "/email/inbound/undelivered-count" "/email/inbound/undelivered?limit=5"; do curl ...; done'
```

```bash
ssh alfares 'kubectl exec -n statex-apps deploy/notifications-microservice -- node -e "...POST /retrieval/agent-context from inside pod..."'
```

## Results

- Targeted test: `PASS src/email/webhook-delivery.service.spec.ts`
  - 4 tests passed.
- Full test suite: 3 suites passed, 14 tests passed.
- Build: `npm run build` passed.
- Read-only production visibility smoke:
  - `/email/inbound/undelivered-count` returned 200 with `{ success, count }` shape.
  - `/email/inbound/undelivered?limit=5` returned 200 with array shape.
- docs-RAG lookup:
  - In-pod call reached docs-RAG but returned `401 Malformed token` using notifications `SERVICE_TOKEN`.
  - Compatible docs-RAG JWT remains unavailable.

Post-approval deployment:

- Owner approved Goal 03 deployment.
- `./scripts/deploy.sh` completed successfully on `alfares`.
- Built and pushed image tag `localhost:5000/notifications-microservice:a56270f`.
- Pushed digest: `sha256:97745eb2e9313586fa66006e3dc50207bfd0ea1770c88cdf73201ccf71f50528`.
- Because the deployment uses `:latest`, the first rollout did not replace the old pod. A manual `kubectl rollout restart deployment/notifications-microservice -n statex-apps` was run.
- Final running pod digest matched `sha256:97745eb2e9313586fa66006e3dc50207bfd0ea1770c88cdf73201ccf71f50528`.
- In-pod `/health` returned 200.
- Post-deploy protected smoke returned 200 for `/email/inbound/undelivered-count` and `/email/inbound/undelivered?limit=5`.

## Manual Checks

- Inspected `src/notifications/notifications.service.ts`; outbound transitions remain `pending -> sent` and `pending -> failed`, and duplicate suppression still checks recent `sent` and `pending` rows.
- Inspected `src/email/inbound-email.service.ts`; inbound processing keeps `pending -> processed` and `pending -> failed`, and S3 duplicate suppression avoids duplicate webhook delivery.
- Inspected `src/email/webhook-delivery.service.ts`; changed behavior is limited to recording failed `webhook_deliveries` rows for matched subscriptions when health check rejects delivery or webhook POST fails.

## Acceptance Criteria Mapping

- Delivery state transitions explicit and testable: met for webhook success/failure transitions with unit tests.
- Duplicate suppression not weakened: met; duplicate logic was inspected and not changed.
- Retry/repair actions guarded and observable: partially met; guarded visibility endpoints smoke-tested, and failed webhook rows improve observability. No production repair action was executed.
- Webhook delivery failures surface evidence: met; failures now create `webhook_deliveries` rows with `failed` status, inbound email ID, subscription ID, optional HTTP status, and error text.
- Tests or smoke checks cover changed behavior: met.

## Gaps

- No real webhook failure was triggered in production.
- docs-RAG remains blocked by token compatibility.
- Broader outbound retry and admin repair UX hardening may still be future work.

## Risks

- Health-check non-200 results now create failed delivery evidence rows. This improves operator visibility, but it may increase failure-row volume if a downstream health endpoint is flaky.
- Existing console logging in `WebhookDeliveryService` makes Jest output noisy; tests still pass.

## Recommendation

Treat Goal 03 as complete and deployed. Proceed to Goal 04.
