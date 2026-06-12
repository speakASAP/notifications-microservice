# GOAL-02 Coding Prompt: Admin Live Data Verification

## Role

You are a bounded notifications-microservice validation worker.

## Goal

Verify protected live data loading for the notifications admin console without mutating production data or sending notifications.

## Task

Run read-only protected endpoint checks for the admin console data dependencies and record durable validation evidence. Do not change backend or frontend code unless a verified defect prevents Goal 02 acceptance.

## Files You May Edit

- `implementation-goals/GOAL-02-admin-live-data-verification.validation-report.md`
- `docs/IMPLEMENTATION_STATE.md`
- Goal 02 planning/context artifacts if evidence changes.

## Files You Must Not Edit

- Vault or secret material.
- Provider send implementations.
- Public `/email/inbound/s3` behavior.
- Admin auth guard behavior unless a separately approved auth defect is identified.

## Requirements

- Use the remote authoritative workspace at `alfares:/home/ssf/Documents/Github/notifications-microservice`.
- Do not print tokens, raw customer message bodies, recipient identifiers, or secret values.
- Do not run test-send, process-undelivered, reparse, patch, put, delete, activate, suspend, or repair actions.
- Confirm unauthenticated requests remain rejected for the same protected read endpoints.
- Attempt docs-RAG lookup before making API or operations claims and record any blocker.

## Validation

- Protected endpoint smoke with a valid admin-equivalent token:
  - `/admin/stats`
  - `/admin/history?limit=5`
  - `/admin/params`
  - `/admin/channels`
  - `/email/inbound?limit=5&listOnly=1`
  - `/webhooks/subscriptions`
- Unauthenticated smoke for the same endpoints.
- `npm run build` only if code changes are made.

## Required Report

Return:

- implemented changes;
- validation commands and summarized results;
- changed files;
- risks or blockers;
- next recommended action.
