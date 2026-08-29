# Claude Instructions

Shared rules live here:

- Claude profile: `/home/ssf/.claude/CLAUDE.md`
- Shared ecosystem instructions: `/home/ssf/Documents/Github/CLAUDE.md`
- Codex profile: `/home/ssf/.codex/AGENTS.md`
- Cross-agent standard: `/home/ssf/.ai-agent-standards/CROSS_AGENT_AUTOMATION_STANDARD.md`
- Repository operations: `AGENT_OPERATIONS.md`

Read those first, then follow the repository-specific notes below and the current planning/status files.


## Repository-Specific Notes

# CLAUDE.md (notifications-microservice)

→ Ecosystem: [../shared/CLAUDE.md](../shared/CLAUDE.md) | Reading order: `BUSINESS.md` → `SYSTEM.md` → `AGENTS.md` → `TASKS.md` → `STATE.json`

---

## Knowledge Retrieval

Use `docs-rag-microservice` for bounded discovery when it is healthy, then
verify deployment, security, database, integration and public-contract facts
against the cited Git source. Git remains authoritative.

Authority and fallback rules:
`/home/ssf/Documents/Github/shared/docs/DOCUMENTATION_AUTHORITY.md`.

Do not generate tokens in documentation or assume an unconfident/failed RAG
response means that source documentation does not exist.

## notifications-microservice

**Purpose**: Multi-channel notification delivery (email, Telegram, WhatsApp) for all Statex services.  
**Port**: 3368  
**Domain**: <https://notifications.alfares.cz>  
**Stack**: NestJS · SendGrid · Telegram Bot API · WhatsApp API  
**Infra**: See [`INFRA.md`](INFRA.md) for K8s namespace, Vault paths, deploy commands.

### Key constraints

- Never send mass notifications without explicit human approval
- API keys in Vault only (`secret/prod/notifications-microservice`) — never log them
- Respect rate limits per channel — enforce at service level
- marketing-microservice must deliver campaigns through this service only

### Consumers

orders-microservice, marketing-microservice, runlayer, all applications.

**Ops**: `curl http://notifications-microservice:3368/health` · `kubectl logs -n statex-apps -l app=notifications-microservice -f` · `./scripts/deploy.sh`
