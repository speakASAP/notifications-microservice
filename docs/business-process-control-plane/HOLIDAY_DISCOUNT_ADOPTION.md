# BPCP Holiday Discount Adoption

Status: service-local adoption contract
Date: 2026-07-02
Service: `notifications-microservice`
Central contract pack: `statex-ecosystem/docs/business-process-control-plane/`

## Role

Post-purchase holiday notification executor.

## Responsibilities

- Consume approved order/payment lifecycle event.
- Resolve Marketing template refs.
- Send one idempotent holiday message when order snapshot contains eligible discount evidence.

## Required interfaces

- Event consumer for paid order.
- Template ref from Marketing.
- Idempotency key based on orderId/processId/processVersion.

## Boundaries

- This service must not become the global owner of BPCP process definitions.
- This service must fail closed on invalid or unknown BPCP process versions.
- This service must keep existing domain ownership and invariants.
- This service must expose or document dry-run behavior before live execution.
- This service must not overwrite existing service contracts without an
  explicit integration owner and validation owner.

## Holiday Discount pilot expectations

- Recognize `holiday-discount-2026` only through versioned BPCP contracts.
- Preserve `processId`, `processVersion`, and `policyId` in every relevant
  decision, event, snapshot, log, or rendered experience.
- Support rollback by respecting BPCP pause and retired states.
- Keep process display and process execution separate where applicable.

## Blockers and unknowns

- [MISSING: final paid-order event contract]
- [MISSING: notification template ref API]

## Validation evidence required before implementation is accepted

- Fixture order with applied holiday discount sends one message.
- Fixture without discount sends none.
- Retry does not duplicate notification.

## Parallel handoff

This adoption doc is safe for a focused service owner to implement in parallel
after the central BPCP schemas are accepted. The service owner must not edit
shared BPCP schemas directly; schema changes go through the BPCP integration
owner.
