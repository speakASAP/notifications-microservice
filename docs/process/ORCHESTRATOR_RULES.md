# Notifications Orchestrator Rules

## Durable State

Use repository files as memory. Chat history is supporting context only.

Primary files:

- `docs/IMPLEMENTATION_STATE.md`
- `docs/IMPLEMENTATION_ORCHESTRATOR.md`
- `implementation-goals/README.md`
- selected goal files and artifacts
- `docs/orchestrator/*` for historical/admin-console intent and status

## Owner Questions

Ask the owner only for:

- scope or intent decisions that cannot be inferred;
- production deployment approval;
- sending real test or mass notifications;
- destructive or privileged operations;
- merge conflict decisions that alter behavior;
- blocked external dependencies.

## Worker Coordination

Workers need bounded write ownership, acceptance criteria, validation commands, and report requirements. The orchestrator integrates their work and updates state.

## Validation

Run the narrowest relevant checks. Record skipped checks and reasons in the validation report and state file.

## Production

Do not deploy production changes unless the owner explicitly asks for deployment or approves it in the current session.
