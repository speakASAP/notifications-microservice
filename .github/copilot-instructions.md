# Copilot Instructions — `notifications-microservice`

> Generated 2026-08-28. Ecosystem-wide rules live in `../shared/CLAUDE.md` and
> `../shared/ECOSYSTEM_MAP.md`. This file only carries what is specific to this repository.

## Location

- **Authoritative path**: `/home/ssf/Documents/Github/notifications-microservice` on the `alfares` server.
- **Origin**: `git@github.com:speakASAP/notifications-microservice.git`, branch `main`.
- The server is the single source of truth. Never mirror this repo into a local user directory,
  and never `scp`/`rsync` files into it. Edit here, commit here, push here.

## Read first

1. `../shared/ECOSYSTEM_MAP.md` — services, ports, domains, integration matrix
2. `../shared/CLAUDE.md` — deploy, safety, verification rules (applies to Copilot too)
3. This repo, in order: `BUSINESS.md` `SYSTEM.md` `AGENTS.md` `AGENT_OPERATIONS.md` `TASKS.md` `STATE.json` `CLAUDE.md`
4. `~/.ai-agent-standards/CROSS_AGENT_AUTOMATION_STANDARD.md` — cross-agent coordination contract

## Deploy

Auto-deploy is **enabled** (`deploy.config.sh` present).

- Committing to `main` queues a deploy via the `post-commit` hook; a systemd worker drains
  the queue one service at a time through `shared/scripts/deploy.sh`. **You usually run no deploy command.**
- Commits touching only `*.md`, `docs/`, `reports/` or `STATE.json` do **not** deploy.
- A service that looks stale is usually waiting its turn. Check, do not repair:
  `shared/scripts/deploy-queue/queuectl.sh status`.
- Failures alert to Telegram. Silence means no failure.
- Manual deploy (rollback / explicit request only): `DRY_RUN=1 ./scripts/deploy.sh` then `./scripts/deploy.sh`.

**Serialization is mandatory.** One node, one containerd. Any `docker build/push/run`,
`docker compose up`, `kubectl apply/rollout/set/scale` or `deploy.sh` must hold the ecosystem
deploy lock: `shared/scripts/with-deploy-lock.sh <cmd>` (`--status` shows the holder).
Nothing enforces this. Sub-agents must stop at the deploy boundary and never deploy.

## Kubernetes

Namespace `statex-apps`. Deployments owned by this repo:

- `notifications-microservice`

Wait on rollouts **only** with `shared/scripts/wait-for-rollout.sh -n statex-apps <deploy>`.
Never `kubectl rollout status` and never hand-rolled jsonpath — both report the old pod as ready.
Internal URL: `http://<service-name>:<PORT>`. External: `https://<domain>.alfares.cz`. Health: `GET /health`.

## Non-negotiables

- Never force-push. Ask first.
- Never copy files into production; all changes go commit → push → deploy, even hotfixes.
- Verify the exact target (host, domain, pod, database) before acting. Similar names are different systems.
- No direct connections to `db-server-postgres` across the pod CIDR — use `kubectl port-forward`/`exec`,
  or the MCP `postgres` server. Never `prisma migrate dev` against production; use `migrate deploy`.
- Never let `kubectl` print Secret `.data`. Key names only; pipe values into the consuming command.
- Secrets never in markdown. Vault path convention: `secret/prod/<service>`.

## Verify before claiming success

- Reproduce the original failing scenario (curl, Playwright MCP, or the failing command) after the fix.
- Check adjacent endpoints; if they broke, revert first, then re-diagnose.
- Never `npx tsc` — it silently runs an unrelated package. Use `./node_modules/.bin/tsc` or a real `npm run typecheck`.

## Context economy

- Prefix commands with `rtk` (at `~/.local/bin/rtk`; not on PATH in non-interactive SSH — export it first).
- Search with `rg`, never `grep`/`find`. `rg` here is a GNU grep shim: use `-E` or patterns silently fail.
- Read ranges, not whole files. Delegate wide reads to sub-agents.
- At ~80% context, write status to `TASKS.md`/`STATE.json` and start fresh.

## Working model

Preserve the Intent Preservation System chain:
`Vision → Goal Impact → System → Feature → Task → Execution Plan → Coding Prompt → Code → Validation`.

Record known out-of-scope failures as validation debt rather than rediscovering them each session.
Mark unavailable facts as `[MISSING: ...]` or `[UNKNOWN: ...]` — never invent contracts, ports or approvals.

Report at the end: role · files changed · docs created · validation commands and results ·
validation debt · blockers · scope deviations · next concrete action.
