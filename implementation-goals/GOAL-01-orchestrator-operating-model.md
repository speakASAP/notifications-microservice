# GOAL-01: Orchestrator Operating Model

## Objective

Implement the Goalkeeper-style working model inside notifications-microservice so one master orchestrator can resume work, choose goals, split plans, coordinate workers, and update durable state.

## Scope

- `AGENTS.md` continuation instructions.
- `docs/IMPLEMENTATION_ORCHESTRATOR.md`.
- `docs/IMPLEMENTATION_STATE.md`.
- `implementation-goals/README.md`.
- `implementation-goals/templates/*`.
- `scripts/next_goal.sh`.

## Acceptance Criteria

- A new session can resume from files without asking the user which goal is next.
- The orchestrator has explicit goal selection, worker coordination, branch, validation, and reporting rules.
- The state file records active, completed, blocked, and next work.
- Templates exist for execution plans, context packages, coding prompts, subagent prompts, and validation reports.
- The next-goal helper prints the state checkpoint and next action.

## Validation

- `git status --short --branch`
- `find docs implementation-goals scripts -maxdepth 3 -type f | sort`
- `./scripts/next_goal.sh`

## Done Report

Use the required Intent Compliance Report from `implementation-goals/README.md`.
