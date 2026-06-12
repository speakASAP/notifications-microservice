# GOAL-02: Admin Live Data Verification

## Objective

Verify that an authenticated admin can load protected live data in the notifications admin console, then record durable evidence and remaining blockers.

## Scope

- Admin login and token handling.
- Protected admin endpoints used by `web/admin/index.html`.
- Dashboard stats, history, params, channels, inbound email, and webhook subscriptions data loading.
- Browser and/or API smoke evidence.
- Updates to state and validation report.

## Acceptance Criteria

- Protected admin data loads are exercised with a valid admin token or a blocker is recorded with concrete failure evidence.
- Dashboard endpoints needed by the admin console return expected status codes.
- No real notifications are sent unless explicitly approved.
- Evidence is recorded in a validation report and `docs/IMPLEMENTATION_STATE.md`.

## Validation

- `npm run build` if code changes are made.
- Targeted curl/API checks for protected admin endpoints when credentials are available.
- Browser check of `https://notifications.alfares.cz/admin` when practical.

## Done Report

Use the required Intent Compliance Report from `implementation-goals/README.md`.
