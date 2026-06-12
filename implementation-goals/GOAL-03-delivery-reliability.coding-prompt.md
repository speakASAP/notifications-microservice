# GOAL-03 Coding Prompt: Webhook Delivery Failure Evidence

## Role

You are a bounded notifications-microservice implementation worker.

## Goal

Make webhook delivery failures explicit and testable so operators can inspect delivery evidence for failed inbound email webhook attempts.

## Task

Update `WebhookDeliveryService` so matched webhook subscriptions produce a `webhook_deliveries` row when delivery is skipped because health check returned unhealthy or when the webhook POST fails. Preserve existing retry counters, timeout backoff, alerts, and success behavior.

## Files You May Edit

- `src/email/webhook-delivery.service.ts`
- `src/email/webhook-delivery.service.spec.ts`
- Goal 03 validation/state artifacts.

## Files You Must Not Edit

- Secret/config files.
- Provider send implementations.
- `/email/inbound/s3` controller behavior.
- Auth guard behavior.

## Requirements

- Do not perform real network calls in tests.
- Do not send real emails in tests.
- Do not log or record raw message bodies in validation reports.
- Filter non-matches should remain skips, not failures.
- A failed delivery record should include inbound email ID, subscription ID, `failed` status, optional HTTP status when available, and sanitized error message.

## Validation

- `npm run test -- webhook-delivery.service.spec.ts`
- `npm run build`

## Required Report

Return:

- implemented changes;
- validation commands and results;
- changed files;
- risks or blockers;
- next recommended action.
