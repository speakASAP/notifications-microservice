# GOAL-02 Validation Report: Admin Live Data Verification

## Goal

Verify that an authenticated admin-equivalent caller can load protected live data used by the notifications admin console, and record concrete evidence or blockers.

## Scope Validated

- Admin auth/token handling at the protected API layer.
- Admin dashboard data dependencies used by `web/admin/index.html`.
- Protected read endpoint behavior for dashboard stats, history, params, channels, inbound email, and webhook subscriptions.
- Unauthenticated rejection for the same protected reads.
- docs-RAG lookup requirement.

## Commands Run

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && git status --short --branch'
```

```bash
ssh alfares 'TOKEN=$(kubectl exec -n statex-apps deploy/notifications-microservice -- printenv SERVICE_TOKEN 2>/dev/null | tr -d "\r"); for path in "/admin/stats" "/admin/history?limit=5" "/admin/params" "/admin/channels" "/email/inbound?limit=5&listOnly=1" "/webhooks/subscriptions"; do code=$(curl -sS -o /tmp/notifications-goal02-response.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" -H "Cache-Control: no-cache" "https://notifications.alfares.cz$path"); bytes=$(wc -c < /tmp/notifications-goal02-response.json | tr -d " "); printf "%s %s bytes=%s\n" "$code" "$path" "$bytes"; node -e "...response shape summary only..."; done; rm -f /tmp/notifications-goal02-response.json'
```

```bash
ssh alfares 'for path in "/admin/stats" "/admin/history?limit=1" "/admin/params" "/admin/channels" "/email/inbound?limit=1&listOnly=1" "/webhooks/subscriptions"; do code=$(curl -sS -o /tmp/notifications-goal02-unauth.json -w "%{http_code}" -H "Cache-Control: no-cache" "https://notifications.alfares.cz$path"); printf "%s %s\n" "$code" "$path"; done; rm -f /tmp/notifications-goal02-unauth.json'
```

```bash
ssh alfares 'kubectl exec -n statex-apps deploy/notifications-microservice -- node -e "...POST /retrieval/agent-context from inside pod without printing token..."'
```

## Results

Protected endpoint smoke with pod `SERVICE_TOKEN`:

| Endpoint | Status | Sanitized response shape |
|---|---:|---|
| `/admin/stats` | 200 | object with totals and grouped counts |
| `/admin/history?limit=5` | 200 | array length 5 |
| `/admin/params` | 200 | object with non-secret service flags and config labels |
| `/admin/channels` | 200 | array length 0 |
| `/email/inbound?limit=5&listOnly=1` | 200 | array length 5 |
| `/webhooks/subscriptions` | 200 | array length 0 |

Unauthenticated smoke:

| Endpoint | Status |
|---|---:|
| `/admin/stats` | 401 |
| `/admin/history?limit=1` | 401 |
| `/admin/params` | 401 |
| `/admin/channels` | 401 |
| `/email/inbound?limit=1&listOnly=1` | 401 |
| `/webhooks/subscriptions` | 401 |

docs-RAG lookup:

- Host-level call to `http://docs-rag-microservice.statex-apps.svc.cluster.local:3397/retrieval/agent-context` could not resolve cluster DNS from the host.
- In-pod call reached docs-RAG but returned `401` with `Malformed token` when using the notifications `SERVICE_TOKEN`.
- Correct docs-RAG JWT was not available in this session.

## Manual Checks

- Inspected `web/admin/index.html` endpoint usage and confirmed the dashboard read paths match the smoked endpoints.
- Inspected `src/app.module.ts` and `src/auth/jwt-roles.guard.ts`; `JwtRolesGuard` is registered globally and requires Bearer auth unless routes are explicitly public.
- Inspected `src/admin/admin.controller.ts`, `src/email/inbound-email.controller.ts`, and `src/email/webhook-subscription.controller.ts` for the relevant read paths.

## Acceptance Criteria Mapping

- Protected admin data loads exercised with valid token: met with admin-equivalent `SERVICE_TOKEN` for all read endpoints in scope.
- Dashboard endpoints return expected status codes: met; all protected read endpoints returned 200 with token.
- No real notifications sent: met; only read-only GET calls were executed.
- Evidence recorded: met in this validation report and `docs/IMPLEMENTATION_STATE.md`.

## Gaps

- Human browser login with a real admin account was not exercised in this session.
- Browser page load itself was not used for authenticated data loading because no human admin credentials were provided and token values were intentionally not moved into local browser storage or screenshots.
- docs-RAG retrieval is blocked by unavailable compatible JWT.

## Risks

- Machine-token success proves route guard compatibility and live data availability, but not the full human auth redirect and localStorage refresh UX.
- Empty channel and webhook arrays are valid live responses but do not prove non-empty rendering states.

## Recommendation

Treat Goal 02 as complete for API-level protected live data verification. Optional follow-up: owner performs a human admin browser login at `https://notifications.alfares.cz/admin` and confirms the dashboard renders live data without redirect bounce.
