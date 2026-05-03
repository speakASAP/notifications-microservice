# CLAUDE.md (notifications-microservice)

→ Ecosystem: [../shared/CLAUDE.md](../shared/CLAUDE.md) | Reading order: `BUSINESS.md` → `SYSTEM.md` → `AGENTS.md` → `TASKS.md` → `STATE.json`

---

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

orders-microservice, marketing-microservice, business-orchestrator, all applications.

**Ops**: `curl http://notifications-microservice:3368/health` · `kubectl logs -n statex-apps -l app=notifications-microservice -f` · `./scripts/deploy.sh`
