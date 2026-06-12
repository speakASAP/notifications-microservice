# GOAL-04 Validation Report: Channel Policy And Template Gap

## Intent Compliance Report

### Goal

Resolve the operational gap between documented template/channel management goals and the current implementation, without inventing unsupported backend behavior.

### Implemented

- Added Goal 04 execution plan, context package, and coding prompt in the remote repository.
- Hardened ChannelRegistryService.updateChannel so admin PATCH accepts only supported channel policy and sender fields.
- Added type checks for channel admin update payloads and explicit rejection for unsupported fields.
- Updated the admin channel editor to show type/provider/domain, a selected-channel policy summary, explicit allow-list behavior, and the current fallback limitation.
- Clarified admin template copy: current behavior is inline message body plus templateData substitution; no persisted template catalog or template CRUD API exists.
- Corrected README webhook subscription routes from /api/webhooks/subscriptions to /webhooks/subscriptions and documented current template behavior.
- Corrected SYSTEM.md away from /notify, /templates, and Handlebars claims.
- Updated public landing copy to avoid implying a notifications-owned persisted template system.

### Not Implemented

- No persisted template entity, migration, controller, or admin CRUD was added.
- No automatic fallback routing behavior was added for inactive/disallowed channel keys.
- No production deployment was performed.
- No notification send or test-send action was run.

### Boundary Check

- Admin JWT guards were not weakened.
- /email/inbound/s3 public AWS compatibility behavior was not changed.
- No secrets or provider credentials were exposed.
- BUSINESS.md was left unchanged because it is marked immutable by AI; the implementation mismatch is clarified in README, SYSTEM, admin copy, and orchestrator docs.

### Workers Used

None.

### Validation Evidence

Remote workspace: alfares:/home/ssf/Documents/Github/notifications-microservice.

- npm run build passed.
- Extracted web/admin/index.html script and ran node --check /tmp/notifications-admin-script.js; passed.
- Protected read smoke using pod SERVICE_TOKEN:
  - GET https://notifications.alfares.cz/admin/channels returned 200, body size 26 bytes.
  - GET https://notifications.alfares.cz/webhooks/subscriptions returned 200, body size 2 bytes.
- docs-RAG query attempted from alfares, but docs-rag-microservice.statex-apps.svc.cluster.local did not resolve from the remote shell: curl code 6. Prior Goal 02 also recorded docs-RAG token/auth limitations.

### Risks

- Live channel registry is currently empty, so production smoke proves protected endpoint availability but not non-empty row rendering.
- fallbackChannelKey remains recorded metadata only; send policy still rejects inactive/disallowed keys rather than auto-routing.
- Template management remains a product decision for a future backend model/controller.

### Files Changed

- README.md
- SYSTEM.md
- web/index.html
- web/admin/index.html
- src/notifications/channel-registry.service.ts
- implementation-goals/GOAL-04-channel-policy-and-template-gap.execution-plan.md
- implementation-goals/GOAL-04-channel-policy-and-template-gap.context-package.md
- implementation-goals/GOAL-04-channel-policy-and-template-gap.coding-prompt.md
- implementation-goals/GOAL-04-channel-policy-and-template-gap.validation-report.md
- docs/IMPLEMENTATION_STATE.md

### Next Action

Proceed to Goal 05 operations deployment readiness, or create commits for the completed goal branches if the owner wants a commit checkpoint first.
