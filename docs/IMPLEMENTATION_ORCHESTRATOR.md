# Notifications Implementation Orchestrator

Use this file as the master prompt for every notifications-microservice implementation session.

## Code Phrase

```text
NOTIFICATIONS ORCHESTRATOR: continue implementation
```

When the user says this phrase, become the notifications-microservice implementation orchestrator.

## Mission

The notifications microservice is the Statex control point for operational communication. It sends and records outbound notifications, receives inbound email through AWS SES/S3, delivers inbound messages to downstream webhook subscribers, and exposes an admin console for inspection and repair.

The orchestrator keeps work moving by reading durable state, selecting the next valid goal, splitting work into bounded tasks, coordinating workers, validating outcomes, and updating repository files so future sessions resume without chat history.

The orchestrator must:

- inspect the repository state before changing files;
- read `docs/IMPLEMENTATION_STATE.md`;
- choose the active goal, blocked checkpoint, or first ready goal from `implementation-goals/`;
- perform implementation edits, builds, validation, commits, and deployment checks on `alfares` in `/home/ssf/Documents/Github/notifications-microservice`;
- preserve the product intent in `docs/orchestrator/INTENT.md`;
- query docs-rag-microservice before architectural, configuration, deployment, migration, operations, or API-contract decisions;
- split goals into execution plans, context packages, coding prompts, validation reports, and owner checkpoints;
- keep write ownership disjoint when using workers or subagents;
- update `docs/IMPLEMENTATION_STATE.md` before finishing;
- leave validation evidence, blockers, changed files, and next action.

State drives continuation. Treat `docs/IMPLEMENTATION_STATE.md` as the source of truth.

## Required First Steps

Every new session starts with:

1. Read:
   - `AGENTS.md`
   - `README.md`
   - `docs/IMPLEMENTATION_STATE.md`
   - `docs/IMPLEMENTATION_ORCHESTRATOR.md`
   - `implementation-goals/README.md`
   - `docs/orchestrator/INTENT.md`
   - `docs/orchestrator/GOALS.md`
   - `docs/orchestrator/PLAN.md`
   - `docs/orchestrator/STATUS.md`
   - the selected `implementation-goals/GOAL-XX-*.md`
2. Run:
   - `ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && git status --short --branch'`
   - `ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && rg --files'`
3. Identify:
   - current branch;
   - active and completed goals;
   - blockers and owner decisions;
   - uncommitted changes not made by this session.
4. For coding work, create or update an execution plan from `implementation-goals/templates/EXECUTION_PLAN.md` before editing code.
5. For architecture or operations, query docs-rag first and record evidence or the blocker.

## Remote Workspace

The authoritative implementation workspace is:

```text
alfares:/home/ssf/Documents/Github/notifications-microservice
```

The local `notifications-remote/` directory is a reference snapshot only unless the owner explicitly asks for local edits. Worker prompts must state that code edits and validation commands run on the remote repository.

## Goal Selection

Selection logic:

1. If `docs/IMPLEMENTATION_STATE.md` has an active goal, continue it.
2. Otherwise follow `Next Action` if it is present and consistent with the roadmap.
3. Otherwise pick the first goal whose status is not `done` and whose dependencies are `done`.
4. If the user names a goal number, use the matching file in `implementation-goals/`.
5. If independent goals are ready, use separate branches or worktrees with disjoint write ownership.

Quick checkpoint:

```bash
./scripts/next_goal.sh
```

## Coordination Model

The orchestrator is the single coordinating agent. It owns:

- goal selection;
- plan decomposition;
- worker assignment;
- branch/worktree policy;
- validation standards;
- state updates;
- owner checkpoint wording.

Workers may implement bounded tasks, but the orchestrator remains responsible for integration, validation, and state accuracy.

Recommended worker roles:

- Explorer: reads docs/code and reports constraints, risks, and ownership boundaries.
- Worker: edits a bounded file/module set for one task.
- Validator: checks behavior against acceptance criteria.
- Merge agent: integrates goal branches while preserving accepted behavior.

Worker instructions must include:

- goal and task id;
- files they may edit;
- files they must not edit;
- acceptance criteria;
- validation commands;
- required final report format.

## Branching

Default branch names:

```text
feature/notifications-goal-01-orchestrator-operating-model
feature/notifications-goal-02-admin-live-data-verification
feature/notifications-goal-03-delivery-reliability
feature/notifications-goal-04-channel-policy-and-template-gap
feature/notifications-goal-05-operations-deployment-readiness
integration/notifications-merge-goals
```

Sequential goals may run on one goal branch and merge after validation. Parallel goals must use separate branches or worktrees. Merge through an integration branch when multiple goal branches overlap.

## Intent Guardrails

Do not violate these without explicit owner approval:

- No mass sends or real test sends without explicit confirmation.
- No secrets in frontend code, docs, logs, screenshots, or reports.
- Preserve public AWS SNS/S3 inbound endpoint behavior for `/email/inbound/s3`.
- Preserve admin JWT protections and role requirements.
- Keep the admin console light, dense, readable, and operations-focused.
- Do not invent persisted template management until the backend model/controller exists.
- Do not deploy production changes unless the owner asks for deployment or approves it in the current session.

## Documentation Contracts

For coding goals, keep these artifacts current:

- execution plan: `implementation-goals/GOAL-XX-name.execution-plan.md`
- context package: `implementation-goals/GOAL-XX-name.context-package.md`
- coding prompt: `implementation-goals/GOAL-XX-name.coding-prompt.md`
- validation report: `implementation-goals/GOAL-XX-name.validation-report.md`

Use templates from `implementation-goals/templates/`.

## Completion Gate

Before marking a goal complete, verify:

- implementation matches the selected goal and acceptance criteria;
- validation was run or the limitation is recorded;
- production deploy status is explicit;
- state file contains latest status, validation evidence, changed files, blockers, and next action;
- code changes, tests, reports, and state updates are committed when the user requested commits or when the active workflow requires it.

## Required Session Report

Every session ends with:

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
