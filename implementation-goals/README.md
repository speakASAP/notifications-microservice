# Notifications Implementation Goals

This directory contains executable goal prompts for separate notifications-microservice orchestration sessions.

Use the master command from `../docs/IMPLEMENTATION_ORCHESTRATOR.md`:

```text
NOTIFICATIONS ORCHESTRATOR: continue implementation
```

To print the current checkpoint:

```bash
./scripts/next_goal.sh
```

## Goals

0. Historical completed work in `../docs/orchestrator/GOALS.md` - admin console implementation and production smoke.
1. `GOAL-01-orchestrator-operating-model.md` - durable Goalkeeper-style orchestration files, state, templates, and continuation flow.
2. `GOAL-02-admin-live-data-verification.md` - protected admin data loads, browser/API evidence, and remaining login/data blockers.
3. `GOAL-03-delivery-reliability.md` - outbound, inbound, webhook retry, dedupe, repair, and delivery-state hardening.
4. `GOAL-04-channel-policy-and-template-gap.md` - channel registry policy UX and documented template-management mismatch.
5. `GOAL-05-operations-deployment-readiness.md` - runbooks, smoke checks, rollback, secret rotation, and deployment evidence.

## Required Workflow

Every goal session must:

1. Read `AGENTS.md`, `README.md`, `docs/IMPLEMENTATION_STATE.md`, `docs/IMPLEMENTATION_ORCHESTRATOR.md`, `docs/orchestrator/*`, this README, and the selected goal file.
2. Run `ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && git status --short --branch'`.
3. Query docs-rag-microservice before answering or changing architecture, config, deployment, migration, API contract, or operations behavior.
4. Create or update an execution plan before coding, and state that implementation work will run on `alfares:/home/ssf/Documents/Github/notifications-microservice`.
5. Keep work within the selected goal scope.
6. Use workers only with disjoint write ownership.
7. Run the narrowest relevant validation.
8. Produce an Intent Compliance Report.
9. Update `docs/IMPLEMENTATION_STATE.md`.
10. Record changed files and next action.

## Remote-First Rule

The authoritative notifications-microservice implementation workspace is:

```text
alfares:/home/ssf/Documents/Github/notifications-microservice
```

Do not implement against the local `notifications-remote/` snapshot unless the owner explicitly asks for local-only work.

## Parallelization

Safe default:

```text
01 -> 02 -> 03 + 04 -> 05
```

Goals 03 and 04 may proceed in parallel after Goal 02 if they use separate branches or worktrees and keep write ownership disjoint.

## Required Final Report Shape

```markdown
## Intent Compliance Report

### Goal
...

### Implemented
...

### Not Implemented
...

### Boundary Check
...

### Workers Used
...

### Validation Evidence
...

### Risks
...

### Files Changed
...

### Next Action
...
```
