# EP-TASK-001-bootstrap-service: Bootstrap notifications-microservice

```yaml
id: EP-TASK-001-bootstrap-service
status: implemented
source_task: ../11_tasks/TASK-001-bootstrap-service.md
goal_impact:
  - ../22_goal_impact/GOAL-IMPACT-TASK-001.md
validation:
  - ../12_validation/VAL-TASK-001-bootstrap-service.md
owner: project owner
created: 2026-08-30
last_updated: 2026-08-30
completeness_level: complete
parallelization_strategy: single_agent
required_gates:
  - adoption
  - pre-coding
```

## Upstream traceability

`../../BUSINESS.md` (approved business intent), `../01_vision/VISION.md` (approved vision), `../../SYSTEM.md` (approved system spec), `../11_tasks/TASK-001-bootstrap-service.md`, `../22_goal_impact/GOAL-IMPACT-TASK-001.md`.

## Scope

Create the missing IPS artifacts and reformat existing root/`docs/` documents into the required section structure and `ips-adoption.json` capability matrix, for this repository only.

## Non-goals

No runtime code, API, deployment manifest, or business-intent changes beyond accurate documentation.

## Project invariants

All invariants in `../17_governance/PROJECT_INVARIANTS.md` are preserved unchanged; this plan does not modify runtime behavior.

## Sensitive-data handling

No secrets, tokens, or real notification content are referenced anywhere in the created documents.

## Contract validation plan

Not applicable — no API/event/persistence contract is created or changed by this plan.

## Replay and determinism plan

Not applicable — no runtime code changed.

## Files to inspect

`README.md`, `BUSINESS.md`, `SYSTEM.md`, `AGENTS.md`, `AGENT_OPERATIONS.md`, `TASKS.md`, `STATE.json`, `docs/17_governance/PROJECT_INVARIANTS.md`, `docs/orchestrator/VALIDATION_DEBT.md`.

## Files to create

`ips-adoption.json`, `docs/00_constitution/CONSTITUTION.md`, `docs/01_vision/VISION.md`, `docs/06_architecture/INTEGRATION_CONTRACT.md`, `docs/11_tasks/TASK-001-bootstrap-service.md`, `docs/22_goal_impact/GOAL-IMPACT-TASK-001.md`, `docs/21_execution_plans/EP-TASK-001-bootstrap-service.md`, `docs/12_validation/VAL-TASK-001-bootstrap-service.md`.

## Files to modify

`README.md`, `BUSINESS.md`, `SYSTEM.md`, `AGENTS.md`, `AGENT_OPERATIONS.md`, `TASKS.md`, `STATE.json`, `docs/17_governance/PROJECT_INVARIANTS.md`, `docs/orchestrator/VALIDATION_DEBT.md`.

## Files that must not be modified

- Any k8s manifests, `scripts/deploy.sh`, or application source code

## Implementation steps

1. Run `scaffold_project_adoption.py` to create missing skeleton files non-destructively.
2. Reformat `README.md`, `BUSINESS.md`, `SYSTEM.md`, `AGENTS.md`, `AGENT_OPERATIONS.md`, `TASKS.md` with the required section headings, preserving all real existing content.
3. Rewrite `STATE.json` to the required schema (`schemaVersion`, `project`, `lifecycle`, `health`, `activeTask`, `lastUpdated`, `deployment`, `blockers`, `followUps`).
4. Fill freshly scaffolded `docs/00_constitution/CONSTITUTION.md` and `docs/01_vision/VISION.md` with real, approved content and an `Approval` section.
5. Set `docs/17_governance/PROJECT_INVARIANTS.md` status to `reviewed` with project-specific invariants.
6. Fill `docs/06_architecture/INTEGRATION_CONTRACT.md` and `ips-adoption.json` with a truthful `required`/`not-applicable` decision and full contract fields for every capability, based on real dependencies documented in `SYSTEM.md`.
7. Remove any placeholder rows in `docs/orchestrator/VALIDATION_DEBT.md` and add the `Update Format` section if missing.
8. Complete this execution plan and the validation report.
9. Run the adoption gate and fix any remaining reported errors.
10. Commit to `main`.

## Parallel execution

| Workstream | Status | Owner role | Allowed files | Dependencies | Validation | Merge order |
| --- | --- | --- | --- | --- | --- | --- |
| Documentation and contracts | complete | Worker agent | root docs + `docs/` tree | None | Adoption gate passes | n/a (single workstream) |

This task ran as a single, non-parallel workstream; no other agent touched this repository concurrently.

## Blockers

No blockers were identified for this documentation-only onboarding task.

## Test plan

Not applicable — no code changes. The functional test is the adoption gate itself.

## Validation plan

Run `python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning` and confirm exit code 0 with no `ERROR:` lines; record the output in `../12_validation/VAL-TASK-001-bootstrap-service.md`.

## Gate commands

Run the adoption gate from the repository root to confirm every artifact is complete before merging:

```bash
python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning
```

## Documentation updates

`README.md`, `BUSINESS.md`, `SYSTEM.md`, `AGENTS.md`, `AGENT_OPERATIONS.md`, `TASKS.md`, `STATE.json`, `docs/00_constitution/CONSTITUTION.md`, `docs/01_vision/VISION.md`, `docs/17_governance/PROJECT_INVARIANTS.md`, `docs/06_architecture/INTEGRATION_CONTRACT.md`, `docs/orchestrator/VALIDATION_DEBT.md`, and this bootstrap chain.

## Rollback plan

Revert the commit (`git revert`) if the adoption profile is later found to misrepresent a real integration; no runtime or deployment rollback is needed since no runtime artifact changed.

## Handoff

Complete. Final integration owner: project owner. No further action required for this task.

## Completion checklist

- [x] Protected intent approved
- [x] Adoption profile valid
- [x] Integration decisions complete
- [x] Implementation and tests complete (documentation-only; not applicable)
- [x] Required integrations exercised (auth, postgres, payments, orders, docs-rag, monitoring decisions documented with real evidence pointers)
- [x] Deployment dry run passes (no deployment required for a docs-only change)
- [x] Validation report complete
