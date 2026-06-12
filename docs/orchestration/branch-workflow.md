# Notifications Branch Workflow

## Default

Use one branch per goal:

```text
feature/notifications-goal-XX-short-name
```

## Parallel Work

Parallel goals require separate branches or worktrees. Workers must have disjoint write ownership.

## Integration

Use:

```text
integration/notifications-merge-goals
```

Merge one goal branch at a time. After each merge, run the validation commands required by the merged goals.

## Completion

Before starting the next goal:

```bash
git status --short --branch
```

The state file must record commits, validation evidence, blockers, and next action.
