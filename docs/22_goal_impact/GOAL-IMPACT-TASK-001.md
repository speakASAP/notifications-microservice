# GOAL-IMPACT-TASK-001: IPS Baseline Adoption

```yaml
id: GOAL-IMPACT-TASK-001
artifact_type: task
artifact_id: TASK-001
artifact_path: ../11_tasks/TASK-001-bootstrap-service.md
primary_goal: ../01_vision/VISION.md#key-outcomes
secondary_goals:
  - ../../BUSINESS.md#success-metrics
impact_level: high
impact_description: Adds traceability, an integration decision matrix, and validation gates for all future notifications-microservice changes.
success_metric: The adoption gate (validate_adoption_profile.py --phase planning) passes from the repository root.
upstream_links:
  - ../11_tasks/TASK-001-bootstrap-service.md
  - ../21_execution_plans/EP-TASK-001-bootstrap-service.md
downstream_links:
  - ../21_execution_plans/EP-TASK-001-bootstrap-service.md
  - ../12_validation/VAL-TASK-001-bootstrap-service.md
validation_method: Run the IPS adoption gate and inspect its exit code and error output.
status: validated
```

## Goal

Bring `notifications-microservice` into full IPS project-adoption compliance, matching the standard already applied to `cv-tuning`, `runlayer`, `wisdom-quotes`, and `logging-microservice`.

## Contribution

This task creates the complete governance/documentation baseline (constitution, vision approval, invariants, integration contract, bootstrap task/plan/validation chain) needed to preserve service intent during future AI-assisted maintenance, reducing the risk of undocumented channel drift or unreviewed integration changes.

## Success metric

`python3 ../intent-preservation-system/scripts/validate_adoption_profile.py --root . --phase planning` exits 0 with no errors.

## Invariant compatibility

Compatible with all invariants in `../17_governance/PROJECT_INVARIANTS.md` — this task only adds documentation and does not touch runtime code, delivery behavior, or the API surface.

## Upstream and downstream links

Upstream: `../11_tasks/TASK-001-bootstrap-service.md` (defines scope and acceptance criteria), `../21_execution_plans/EP-TASK-001-bootstrap-service.md` (defines implementation steps).
Downstream: `../21_execution_plans/EP-TASK-001-bootstrap-service.md`, `../12_validation/VAL-TASK-001-bootstrap-service.md` (records validation evidence).

## Validation method

Run the adoption gate from `/home/ssf/Documents/Github`:
```
python3 intent-preservation-system/scripts/validate_adoption_profile.py --root notifications-microservice --phase planning
```
A clean exit (code 0, no `ERROR:` lines) confirms the goal is met.
