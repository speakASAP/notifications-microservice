# Business: notifications-microservice
>
> ⚠️ IMMUTABLE BY AI.

## Goal

Multi-channel notification delivery (email, Telegram, WhatsApp) for all Statex services. Central template management.

## Constraints

- AI must never send mass notifications without explicit approval
- API keys (SendGrid, Telegram, WhatsApp) managed in .env only
- Rate limits must be respected per channel

## Consumers

All applications, marketing-microservice, orders-microservice, business-orchestrator.

## SLA

- Port: 3368 (<http://notifications-microservice:3368>)
- Production: <https://notifications.statex.cz>
