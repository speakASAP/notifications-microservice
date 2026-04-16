# CLAUDE.md (notifications-microservice)

Ecosystem defaults: sibling [`../CLAUDE.md`](../CLAUDE.md) and [`../shared/docs/PROJECT_AGENT_DOCS_STANDARD.md`](../shared/docs/PROJECT_AGENT_DOCS_STANDARD.md).

Read this repo's `BUSINESS.md` → `SYSTEM.md` → `AGENTS.md` → `TASKS.md` → `STATE.json` first.

---

## notifications-microservice

**Purpose**: Multi-channel notification delivery (email, Telegram, WhatsApp) for all Statex services.  
**Port**: 3368  
**Domain**: https://notifications.alfares.cz  
**Stack**: NestJS · SendGrid · Telegram Bot API · WhatsApp API

### Key constraints
- Never send mass notifications without explicit human approval
- API keys (SendGrid, Telegram, WhatsApp) in `.env` only — never log them
- Respect rate limits per channel — enforce at service level
- marketing-microservice must deliver campaigns through this service only

### Consumers
orders-microservice, marketing-microservice, business-orchestrator, all applications.

### Quick ops
```bash
curl http://notifications-microservice:3368/health
docker compose logs -f
./scripts/deploy.sh
```
