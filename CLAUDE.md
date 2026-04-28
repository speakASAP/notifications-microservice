# CLAUDE.md (notifications-microservice)

Ecosystem defaults: sibling [`../CLAUDE.md`](../CLAUDE.md) and [`../shared/docs/PROJECT_AGENT_DOCS_STANDARD.md`](../shared/docs/PROJECT_AGENT_DOCS_STANDARD.md).

Read this repo's `BUSINESS.md` → `SYSTEM.md` → `AGENTS.md` → `TASKS.md` → `STATE.json` first.

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

### Quick ops

```bash
kubectl exec -n statex-apps deploy/notifications-microservice -- wget -q http://localhost:3368/health -O-
kubectl logs -n statex-apps deploy/notifications-microservice --tail=50 -f
./scripts/deploy.sh
```
