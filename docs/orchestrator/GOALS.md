# Notifications Admin Goals

## Active Goal

Create an intent-preserved, goals-driven admin frontend for the notifications microservice on `alfares`, documenting the notifications domain and making communication flows controllable by an admin.

## Success Criteria

- [x] Map the actual notifications APIs, entities, channels, lifecycle, and integration points.
- [x] Preserve the domain intent and known documentation mismatches in repository docs.
- [x] Create a light, readable admin UI from scratch under `web/admin/index.html`.
- [x] Show ecosystem flow, channel health, stats, message stream, inbound email, webhook subscriptions, settings, and docs status.
- [x] Let admins edit outbound message subject/body/template JSON/status.
- [x] Let admins edit inbound email subject/body/status.
- [x] Let admins edit channel registry policy fields.
- [x] Let admins inspect and update webhook subscription fields.
- [x] Build the service successfully.
- [x] Deploy to Kubernetes with `./scripts/deploy.sh`.
- [x] Verify `https://notifications.alfares.cz/admin` loads and the admin UI renders.

## Guardrails

- Test-send actions must require explicit user confirmation.
- Do not expose secrets in the frontend.
- Do not invent a persisted template system until a backend model/controller exists.
- Preserve S3 inbound public endpoint behavior.
- Keep UI styling light and balanced, avoiding heavy dark-blue or dark-teal surfaces.
