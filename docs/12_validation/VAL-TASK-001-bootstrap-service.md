# VAL-TASK-001-bootstrap-service: Validate notifications-microservice bootstrap

```yaml
id: VAL-TASK-001-bootstrap-service
target: TASK-001-bootstrap-service
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-001.md
status: validated
validator: project owner (via Copilot CLI onboarding session)
date: 2026-08-30
sensitive_data_classification: none
parallel_workstream_context: final-integration
```

## Summary

`notifications-microservice` now carries a complete IPS adoption profile: every required root/`docs/` artifact contains the validator-required section headings, `BUSINESS.md`/`CONSTITUTION.md`/`VISION.md` carry an approved status with durable evidence, `STATE.json` matches the required schema, and every ecosystem capability in `ips-adoption.json` has a concrete `required`/`not-applicable` decision grounded in the service's real documented dependencies.

## Upstream goal

`../22_goal_impact/GOAL-IMPACT-TASK-001.md` — close the ecosystem-wide IPS adoption gap for this repository.

## Acceptance criteria evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| `ips-adoption.json` has a concrete decision for every capability | Pass | 16 capabilities reviewed, each `required` or `not-applicable` with a reason |
| Every required artifact has all required section headings | Pass | Adoption gate exits 0 (see Gate evidence) |
| Protected docs carry a concrete approver and durable evidence | Pass | `BUSINESS.md`, `CONSTITUTION.md`, `VISION.md` each contain `Approval` with `Approved by: project owner` and `owner-confirmation: notifications-microservice-onboarding-approved` |
| Adoption gate passes | Pass | See Gate evidence |

## Gate evidence

| Gate | Command | Result | Evidence |
| --- | --- | --- | --- |
| Adoption | `python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning` | Pass | `IPS adoption profile valid for planning: notifications-microservice (16 capabilities reviewed)`, exit code 0 |
| Pre-coding | Not applicable | n/a | No code changes in this task |
| Application | Not applicable | n/a | Documentation-only task |
| Integration | Not applicable | n/a | No integration behavior changed |
| Deployment dry run | Not applicable | n/a | No deployment required for a docs-only change |

## Integration evidence

Auth: admin endpoint JWT verification is documented in `README.md`/`SYSTEM.md` and cross-referenced in `INTEGRATION_CONTRACT.md`. Postgres: notification history/channel-registry persistence is documented in `SYSTEM.md`. Payments: `POST /webhooks/payment-result` callback is documented in `SYSTEM.md`/`README.md`. Docs-rag/monitoring: `GET /health` and Git-based documentation ingestion are already live in production per `SYSTEM.md`.

## Invariant evidence

All invariants in `docs/17_governance/PROJECT_INVARIANTS.md` (no unapproved bulk/test sends, secret handling, per-channel rate limits, public inbound webhook path) remain unchanged; this task added documentation only.

## Sensitive-data evidence

Manual review of every created/edited file confirms no secrets, tokens, or real notification content are present; only Vault path names and config key names are referenced, consistent with existing `SYSTEM.md` conventions.

## Replay and determinism evidence

Not applicable — no runtime code was changed.

## Issues and validation debt

None introduced by this task.

## Deviations

None. All content was reformatted from the service's real pre-existing documentation.

## Recommendation

Accept. The adoption gate passes cleanly and every artifact reflects the service's real, already-documented operational intent.

## Traceability confirmation

Confirmed aligned with `../BUSINESS.md` (multi-channel notification delivery) and `../01_vision/VISION.md` (reliable notification API) — no business or vision claim was altered, only reformatted into the required IPS structure.
