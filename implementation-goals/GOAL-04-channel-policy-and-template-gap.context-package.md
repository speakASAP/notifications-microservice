# GOAL-04 Context Package: Channel Policy And Template Gap

## Repository

Remote source workspace: `alfares:/home/ssf/Documents/Github/notifications-microservice`.
Branch: `feature/notifications-goal-04-channel-policy-and-template-gap`.

## Findings

- `src/admin/admin.controller.ts` exposes protected `/admin/channels`, `/admin/channels/:channelKey`, and `PATCH /admin/channels/:channelKey`.
- `src/notifications/channel-registry.service.ts` resolves a `channelKey` by checking active state, allowed applications, allowed purposes, provider, sender identity, and reply-to identity.
- `fallbackChannelKey` is stored on `channel_registry`, but `resolveSendPolicy` does not automatically route to fallback when a selected key is inactive or disallowed.
- `web/admin/index.html` already edits active state, fallback key, sender identity, purposes, and applications, but needs clearer operator copy and current-policy summary.
- `README.md` documents `/api/webhooks/subscriptions`, but the implemented controller route used by the admin UI and Goal 02 validation is `/webhooks/subscriptions`.
- `SYSTEM.md` documents `/notify`, `/templates`, and Handlebars, but inspected code implements `/notifications/send` and inline `templateData` replacement only; no persisted template controller/entity exists.
- `BUSINESS.md` contains `IMMUTABLE BY AI`; leave it unchanged and document the implementation reality elsewhere.

## docs-RAG Evidence

Required docs-RAG query was attempted from `alfares`; remote shell could not resolve `docs-rag-microservice.statex-apps.svc.cluster.local`, returning curl code 6. Prior Goal 02 also recorded docs-RAG token/auth issues.

## Guardrails

- Do not expose secrets.
- Do not send notifications.
- Do not deploy without explicit approval.
- Do not invent persisted template management.
