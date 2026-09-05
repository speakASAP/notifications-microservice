# Notifications Microservice Implementation State

Last updated: 2026-09-04.

## Orchestrator Command

```text
2026-07-04: Goal 24 selected unpaid Orders cancellation Notifications acknowledgement created for selected central order hash 04d7d08c82a07853. Notifications source-governance decision: no pre-route notification send, validate call, channel mutation, broker mutation, recipient mutation, provider dispatch, DB write, deploy, or secret read is required before Orders planning may use sideEffectsHandled.notification=true for this selected-hash source-only plan. Added docs/orchestrator/GOAL-24-selected-unpaid-orders-cancellation-notifications-ack.md, reports/validation/GOAL-24-selected-unpaid-orders-cancellation-notifications-ack.md, scripts/verifier/verify-goal24-selected-unpaid-cancel-ack.js, and package script verify:goal24-selected-unpaid-cancel-ack. No runtime source, Orders repo, live send, broker, DB, channel, recipient config, deploy, secret, raw order/customer/payment data, or customer contact action was touched. Remaining blockers: [MISSING: owner-approved runtime packet for any future live Orders cancellation route invocation], [MISSING: owner-approved recipient/customer-contact policy if a future cancelled event should notify a real recipient], [MISSING: final Orders-owned route evidence if Orders later executes the cancellation].
2026-07-02: Goal 7.4 Orders lifecycle-changed event boundary updated on isolated branch `codex/notifications-orders-lifecycle-event`. Notifications now accepts `orders.order.lifecycle_changed.v1`, validates approved lifecycle stages plus status/payment/fulfillment/delivery status fields, maps lifecycle changes to `order_status_update`, stores bounded lifecycle metadata for idempotency/audit, and still rejects sensitive customer/address/payment/tracking/token fields. Validation passed: `npm test -- --runTestsByPath src/notifications/orders-events/orders-event-notification.router.spec.ts` (6 tests), `npm run build`, `npm test -- --runInBand` (6 suites / 26 tests), and `git diff --check`. No deployment, live broker consumer, runtime recipient change, notification send, or secret read is performed in this branch.
NOTIFICATIONS ORCHESTRATOR: continue implementation
```

To start a specific goal:

```text
NOTIFICATIONS ORCHESTRATOR: implement goal number 2
```

## Current Status

- Active goal: none
- Current wave: Wave 3 - Operations deployment readiness complete
- Completed goals: 00 Admin Console Implementation, 01 Orchestrator Operating Model, 02 Admin Live Data Verification, 03 Delivery Reliability, 04 Channel Policy And Template Gap, 05 Operations Deployment Readiness
- Running goals: none
- Blocked goals: none
- Production URL: `https://notifications.alfares.cz`
- Admin URL: `https://notifications.alfares.cz/admin`
- Remote repository: `/home/ssf/Documents/Github/notifications-microservice`
- Remote implementation rule: perform implementation edits, builds, validation, commits, and deployments on `alfares` in `/home/ssf/Documents/Github/notifications-microservice`
- Agent entrypoint: `AGENTS.md`
- Master orchestrator prompt: `docs/IMPLEMENTATION_ORCHESTRATOR.md`
- Goal registry: `implementation-goals/README.md`
- Historical admin-console docs: `docs/orchestrator/`
- Deployment rule: deploy only after explicit owner approval or direct owner request

## Goal Roadmap

| Goal | File | Status | Branch | Depends On | Notes |
|---|---|---|---|---|---|
| 00 | `docs/orchestrator/GOALS.md` | done | historical | none | Admin console implementation already deployed and smoke-tested |
| 01 | `implementation-goals/GOAL-01-orchestrator-operating-model.md` | done | `feature/notifications-goal-01-orchestrator-operating-model` | none | Durable orchestration, state, continuation workflow, templates, and helper installed |
| 02 | `implementation-goals/GOAL-02-admin-live-data-verification.md` | done | `feature/notifications-goal-02-admin-live-data-verification` | 01 | Protected admin read endpoints exercised with token and unauthenticated rejection verified |
| 03 | `implementation-goals/GOAL-03-delivery-reliability.md` | done | `feature/notifications-goal-03-delivery-reliability` | 01, 02 | Webhook failure evidence rows implemented and tested; broader outbound retry remains future work |
| 04 | `implementation-goals/GOAL-04-channel-policy-and-template-gap.md` | done | `feature/notifications-goal-04-channel-policy-and-template-gap` | 01, 02 | Channel policy UX clarified, channel updates whitelisted, and template/webhook route docs corrected |
| 05 | `implementation-goals/GOAL-05-operations-deployment-readiness.md` | done | `feature/notifications-goal-05-operations-deployment-readiness` | 01 | Added deployment runbook, rollback/secret rotation guidance, and non-destructive readiness smoke |

## Execution Waves

| Wave | Goals | Mode | Gate Before Next Wave |
|---|---|---|---|
| 0 | 01 | complete | Orchestrator docs, templates, next-goal helper, and state file exist |
| 1 | 02 | sequential | Protected admin data load evidence recorded |
| 2 | 03 + 04 | complete | Delivery reliability and product gap work validated independently; no deployment performed |
| 3 | 05 | complete | Deployment readiness and rollback evidence documented; no deployment performed |

## Worker Threads

None.

When workers are launched, record compressed summaries here:

```text
Worker:
Goal:
Task:
Branch/worktree:
Write ownership:
Status:
Summary:
Validation:
Risks:
Changed files:
```

## State Update Rules

At the end of every implementation session, update:

- active goal and goal status;
- current wave;
- branch name;
- whether work and validation were performed on `alfares:/home/ssf/Documents/Github/notifications-microservice`;
- worker summaries;
- validation evidence;
- blockers and owner questions;
- changed files;
- commit SHA if created;
- next recommended command.

Do not paste full logs. Compress implementation, validation, risks, and changed files enough that the next session can resume from files.

## Validation Evidence Log

2026-09-04: Template-library consistency review completed on `alfares:/home/ssf/Documents/Github/notifications-microservice`. Updated all five files under `implementation-goals/templates/` to align with the repository's IPS template structure: explicit metadata, intent and traceability, sensitive-data boundaries, contract/replay impact, gate evidence, acceptance criteria, stop conditions, and completion decisions. Validation passed: `git diff --check` and a required-section script confirmed all template contracts are present. No runtime source, deployment, notification send, provider call, secret read, or customer data was touched.

Newest entries first.

## Open Decisions

- Whether template management should become a real persisted backend feature remains an owner decision; Goal 04 documents the current implementation as inline `templateData` only and treats persisted templates as future product work.
- Whether the owner wants an additional human browser login check for `/admin`; Goal 02 used admin-equivalent machine-token API evidence.

## Next Action

Template-library consistency review is complete.

To print the base notifications checkpoint, run:

```bash
./scripts/next_goal.sh
```

2026-07-03 continuation: Orders lifecycle notification readiness drift was repaired without enabling the consumer. Current `main` commit `cd95255` was deployed as `localhost:5000/notifications-microservice:cd95255`; public and in-pod `/health/orders-events` now return HTTP 200 with `ORDERS_EVENTS_CONSUMER_ENABLED=false`, no broker connection/consumption, routing keys configured, DLX/DLQ configured, and counters all `0`. Validation passed before deploy: `npm run build` and `npm test -- --runInBand` (8 suites / 36 tests). No notification send, provider call, channel-registry mutation, recipient config mutation, customer data access, or consumer enablement was performed. No Orders lifecycle notification blocker remains from this lane.
