# Project Invariants

```yaml
id: PROJECT-INVARIANTS
status: reviewed
owner: Engineering
created: 2026-08-30
last_updated: 2026-08-30
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
  - ../01_vision/VISION.md
```

## Purpose

Project invariants convert notifications-microservice intent into checks agents must preserve before coding and before deployment.

## Applicability

Project-specific invariants apply because this service sends real notifications to real users on behalf of the whole ecosystem.

## Invariants

| ID | Level | Source | Rule | Forbidden outcome | Validation method | Gate |
|---|---|---|---|---|---|---|
| NOTIF-INV-001 | product | `../../BUSINESS.md` | AI must never send mass or test notifications without explicit owner approval. | Unapproved bulk/test send reaches real users. | Manual review of send calls in the task/plan. | pre-coding/deployment |
| NOTIF-INV-002 | security | `../../BUSINESS.md` | API keys (SendGrid, Telegram, WhatsApp, AWS) stay in Vault/`.env`, never in documentation or code. | Secret committed to Git or printed in docs/logs. | Sensitive-data scan. | pre-coding/deployment |
| NOTIF-INV-003 | operational | `../../BUSINESS.md` | Per-channel rate limits must be respected. | Send logic bypasses documented channel rate limits. | Review send-path code against channel limits. | pre-coding |
| NOTIF-INV-004 | architecture | `../../SYSTEM.md` | `/email/inbound/s3` remains public and unauthenticated for AWS SNS/S3 compatibility. | Auth added to the inbound webhook path, breaking SNS delivery. | Review route guards before deployment. | deployment |

## Exceptions

No exceptions are approved in this baseline.

## Review cadence

Review invariants when the notification channel set, template model, or inbound-email architecture changes.
