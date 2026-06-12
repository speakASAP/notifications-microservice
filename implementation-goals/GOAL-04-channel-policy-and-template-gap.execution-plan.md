# GOAL-04 Execution Plan: Channel Policy And Template Gap

## Intent

Resolve the gap between documented template/channel-management expectations and the current notifications implementation without adding unsupported persisted template behavior.

## Remote Workspace

All implementation and validation runs on `alfares:/home/ssf/Documents/Github/notifications-microservice`.

## Scope

- Clarify and harden channel registry admin editing.
- Make admin channel policy copy explicit about active state, allow lists, sender identity, and fallback limitations.
- Correct README/SYSTEM/public landing documentation where it implies implemented `/templates`, `/notify`, `/api/webhooks/*`, Handlebars, or persisted template management.
- Record template management as future design only unless the owner explicitly approves a backend feature.

## Out Of Scope

- Creating a templates table/controller.
- Sending test notifications or mass notifications.
- Deploying production changes.
- Changing public `/email/inbound/s3` behavior or admin JWT guards.

## Tasks

1. Inspect source, docs, and docs-RAG availability.
2. Whitelist editable channel registry fields in the backend update path.
3. Add admin UI policy summary/copy for selected channels and current inline-template behavior.
4. Update docs to match implemented routes and current template behavior.
5. Run build and protected API smoke checks for changed behavior.
6. Write validation report and update implementation state.

## Validation

- `npm run build` after code changes.
- JavaScript syntax extraction/check for changed admin frontend script.
- Protected API smoke for `/admin/channels` and `/webhooks/subscriptions` with service token.
- Documentation review of README/SYSTEM/public landing text.

## Risks

- Live channel registry can be empty; UI must still explain legacy fallback without implying editable persisted rows exist.
- docs-RAG access may remain blocked by DNS/JWT issues; record exact failure.
