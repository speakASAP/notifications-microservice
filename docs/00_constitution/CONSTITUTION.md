# Project Constitution: notifications-microservice

> Protected document. Human approval is required. AI agents may draft only from
> approved source material and must not modify the approved baseline directly.

```yaml
id: CONSTITUTION-notifications-microservice
status: approved
owner: project owner
created: 2026-08-30
last_updated: 2026-08-30
completeness_level: complete
upstream: []
downstream:
  - ../01_vision/VISION.md
  - ../17_governance/PROJECT_INVARIANTS.md
```

## Purpose

This constitution protects `notifications-microservice`'s purpose as the ecosystem's multi-channel (email/Telegram/WhatsApp) notification delivery service, as approved in `../../BUSINESS.md`, and prevents silent scope or API drift.

## Constitutional principles

### Intent preservation

Every implementation artifact must trace to approved project intent in `../../BUSINESS.md` and this constitution.

### Human-controlled change

Sending mass notifications or test sends that reach real users requires explicit owner approval. `BUSINESS.md` remains human-owned and immutable to AI agents.

### Scope boundaries

The service delivers notifications across email, Telegram, and WhatsApp, and handles inbound email/webhook delivery. It does not own marketing campaign logic (`marketing-microservice` does) and does not yet implement a persisted template catalog.

### Data and security

API keys (SendGrid, Telegram, WhatsApp, AWS) stay in Vault/`.env`, never in documentation or code. `/email/inbound/s3` remains public for AWS SNS/S3 compatibility; admin routes remain JWT-protected.

### Validation

No task is complete without evidence against its acceptance criteria and upstream goal.

## Amendment process

1. Create an amendment proposal under `docs/17_governance/amendments/`.
2. Explain the change, reason, affected artifacts and compatibility impact.
3. Obtain human approval.
4. Update dependent artifacts and rerun relevant validation.

## Approval

Status: approved
Approved by: project owner
Approval evidence: owner-confirmation: notifications-microservice-onboarding-approved
