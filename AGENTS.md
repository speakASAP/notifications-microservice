# Repository Agent Instructions

Shared rules live here:

- Codex profile: `/home/ssf/.codex/AGENTS.md`
- Cross-agent standard: `/home/ssf/.ai-agent-standards/CROSS_AGENT_AUTOMATION_STANDARD.md`
- Repository operations: `AGENT_OPERATIONS.md`

Read those first, then follow the repository-specific notes below and the current planning/status files.


## Repository-Specific Notes

# Agents: notifications-microservice

## One-Command Continuation

When the user says:

```text
NOTIFICATIONS ORCHESTRATOR: continue implementation
```

or:

```text
Continue implementation of this project.
```

act as the notifications-microservice implementation orchestrator.

Do not ask the user which goal is next. Determine the next action from:

```text
docs/IMPLEMENTATION_STATE.md
docs/IMPLEMENTATION_ORCHESTRATOR.md
implementation-goals/README.md
```

Then continue from the latest checkpoint.

## Required Reading

Before implementation, branch orchestration, worker coordination, deployment, or operational decisions, read:

```text
README.md
AGENTS.md
docs/IMPLEMENTATION_STATE.md
docs/IMPLEMENTATION_ORCHESTRATOR.md
implementation-goals/README.md
docs/orchestrator/INTENT.md
docs/orchestrator/GOALS.md
docs/orchestrator/PLAN.md
docs/orchestrator/STATUS.md
```

For a specific goal, also read the matching file in `implementation-goals/`.

## Remote-First Implementation Workspace

All notifications-microservice implementation work happens on the remote server:

```text
alfares:/home/ssf/Documents/Github/notifications-microservice
```

Use:

```bash
ssh alfares
cd /home/ssf/Documents/Github/notifications-microservice
```

For one-off commands:

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && <command>'
```

The local `notifications-remote/` directory is only a mirror/reference snapshot unless the owner explicitly asks for a local-only edit. Plans, prompts, validation reports, and status updates must state whether evidence came from the remote repository.

## Orchestrator Duties

1. Read `docs/IMPLEMENTATION_STATE.md`.
2. Identify the active goal, next ready goal, or blocked checkpoint.
3. Run only the next valid goal according to `implementation-goals/README.md`.
4. Split large goals into an execution plan, bounded tasks, worker prompts, and validation reports.
5. Use isolated branches or worktrees for parallel goals.
6. Keep write ownership disjoint when using workers or subagents.
7. Update `docs/IMPLEMENTATION_STATE.md` after every implementation session.
8. Require an Intent Compliance Report before marking a goal complete.
9. Run or document validation before moving to the next goal.
10. Do not deploy production changes without explicit owner approval or a direct deployment request.

## Branch Rules

Use the workflow in:

```text
docs/orchestration/branch-workflow.md
```

Sequential goals may run on one goal branch and merge after validation. Parallel goals must use separate branches or worktrees. Merge parallel work through:

```text
integration/notifications-merge-goals
```

## Knowledge Retrieval

Use `docs-rag-microservice` for bounded discovery when it is healthy, then
verify deployment, security, database, integration and public-contract facts
against the cited Git source. Git remains authoritative.

Authority and fallback rules:
`/home/ssf/Documents/Github/shared/docs/DOCUMENTATION_AUTHORITY.md`.

Do not generate tokens in documentation or assume an unconfident/failed RAG
response means that source documentation does not exist.

## Product And Operations Guardrails

- Service: notifications-microservice.
- Production domain: `https://notifications.alfares.cz`.
- Port: `3368`.
- Admin panel: `https://notifications.alfares.cz/admin`.
- Main responsibility: multi-channel notifications for Statex services, including email, Telegram, WhatsApp, inbound SES/S3 email, and webhook delivery.
- Never send mass notifications without explicit approval.
- Test-send actions can reach real users and must require explicit confirmation.
- Secrets stay in environment/Vault, not frontend code or documentation.
- `/email/inbound/s3` remains public for AWS SNS/S3 compatibility.
- Admin APIs remain protected by JWT role guards.

## Authority

`BUSINESS.md` is human-owned and immutable to AI agents. `SYSTEM.md`, planning, and orchestration docs may be proposed/updated by agents subject to review.

## Intent Preservation System

This repository follows `Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation` per `AGENT_OPERATIONS.md` and the central `intent-preservation-system` standard.

## Safety and Operations

Never send mass or test notifications without explicit owner approval; never print secrets or tokens; keep `/email/inbound/s3` public and unauthenticated for AWS compatibility.

## Project-Specific Rules

See "Product And Operations Guardrails" above.

## Required Final Report

Report files changed, validation evidence, validation debt used or added, blockers as `[MISSING: ...]`/`[UNKNOWN: ...]`, and the next concrete action.

## Active Agents

<!-- Coordinator-maintained -->
None.
