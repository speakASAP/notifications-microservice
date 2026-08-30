# TASK-001-bootstrap-service: Bootstrap notifications-microservice

```yaml
id: TASK-001-bootstrap-service
status: completed
owner: project owner
created: 2026-08-30
last_updated: 2026-08-30
completeness_level: complete
upstream:
  - ../../BUSINESS.md
  - ../../SYSTEM.md
  - ../01_vision/VISION.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-001.md
execution_plan:
  - ../21_execution_plans/EP-TASK-001-bootstrap-service.md
project_invariant_impact: preserves
sensitive_data_classification: none
contract_schema_impact: none
replay_determinism_impact: unaffected
parallel_workstream_context: final-integration
required_gates:
  - adoption
  - pre-coding
```

## Objective

Bring the already-running `notifications-microservice` into full IPS project-adoption compliance: a complete `ips-adoption.json` profile and the required root/`docs/` document set, reformatted from its existing real operational documentation without inventing new business intent.

## Upstream links

- `../../BUSINESS.md` — approved multi-channel notification business intent.
- `../../SYSTEM.md` — approved technical/deployment spec.
- `../01_vision/VISION.md` — approved product vision.

## Goal impact

See `../22_goal_impact/GOAL-IMPACT-TASK-001.md` — this task closes the ecosystem-wide IPS adoption gap for this repository.

## Project invariant impact

Preserves all invariants in `../17_governance/PROJECT_INVARIANTS.md` (no unapproved bulk/test sends, secret handling, per-channel rate limits, public inbound webhook path). This task changes documentation only, not runtime behavior.

## Sensitive-data classification

None. No API keys, tokens, or real notification content are included in any onboarding document.

## Contract and schema impact

None. This task creates governance/documentation artifacts only; it does not add, remove, or change any API, event, or persistence contract.

## Replay and determinism impact

Not applicable — no runtime code changed.

## Scope

- Add the missing `docs/06_architecture/INTEGRATION_CONTRACT.md`, `docs/11_tasks/TASK-001-bootstrap-service.md`, `docs/21_execution_plans/EP-TASK-001-bootstrap-service.md`, `docs/12_validation/VAL-TASK-001-bootstrap-service.md`, `docs/00_constitution/CONSTITUTION.md`, `docs/01_vision/VISION.md`, and `ips-adoption.json`.
- Reformat `README.md`, `BUSINESS.md`, `SYSTEM.md`, `AGENTS.md`, `AGENT_OPERATIONS.md`, `TASKS.md`, `STATE.json`, and `docs/17_governance/PROJECT_INVARIANTS.md` into the required IPS section/schema structure, preserving all pre-existing real content.
- Decide every ecosystem integration capability as `required` or `not-applicable` with a project-specific reason, based on the service's actual documented dependencies.

## Non-goals

- No runtime code, API, or deployment manifest changes.
- No change to the service's actual business purpose, channels, or integrations beyond documenting them accurately.

## Acceptance criteria

- [x] `ips-adoption.json` exists with a concrete decision for every capability.
- [x] Every required root and `docs/` artifact contains all validator-required section headings.
- [x] `BUSINESS.md`, `docs/00_constitution/CONSTITUTION.md`, and `docs/01_vision/VISION.md` carry an `Approval` section with a concrete human approver and durable evidence.
- [x] `python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning` exits 0.

## Required context

- `../../BUSINESS.md`
- `../../SYSTEM.md`
- `../06_architecture/INTEGRATION_CONTRACT.md`
- `../17_governance/PROJECT_INVARIANTS.md`
- `../21_execution_plans/EP-TASK-001-bootstrap-service.md`
- `/home/ssf/Documents/Github/shared/docs/CREATE_SERVICE.md`
- `/home/ssf/Documents/Github/intent-preservation-system/docs/24_onboarding/PROJECT_ADOPTION_STANDARD.md`

## Validation task

Validation report:
`../12_validation/VAL-TASK-001-bootstrap-service.md`.

## Required gates

| Gate | Command or evidence | Blocks on |
| --- | --- | --- |
| Adoption | `python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning` | Missing/incomplete project documents or integration decisions |
| Pre-coding | Not applicable — no code changes in this task | n/a |
| Application | Not applicable — documentation-only task | n/a |
| Integration | Not applicable — no integration behavior changed | n/a |

## Parallel workstream context

Final-integration: this task is documentation-only and does not block or depend on any other active workstream in this repository.
