# Notifications Admin Implementation Plan

## Coordinator Model

The work is coordinated as a GoalKeeper-style flow:

1. Discover the domain and current implementation.
2. Preserve intent and goal state in docs.
3. Implement narrow backend API support for admin edits.
4. Replace the current admin frontend with an operations console.
5. Validate build and deploy.
6. Smoke test the production admin route.

## Worker Findings Integrated

Explorer A mapped the notifications service domain:

- outbound channels: email/SES/SendGrid, Telegram, WhatsApp;
- inbound path: AWS SES stores MIME in S3, S3/SNS posts to `/email/inbound/s3`;
- downstream path: webhook subscriptions receive processed inbound email;
- edit reality: no persisted template table exists, current editable surfaces are messages and channel registry.

Explorer B mapped RunLayer/frontend context:

- RunLayer already calls notifications through backend clients;
- RunLayer has its own static admin route but exposing notification control there would require a guarded proxy;
- notifications-microservice already serves `/admin`, so the admin console belongs in that service for this task.

## Implementation Slices

- Backend:
  - Make `/api/config` public so the static login screen can discover auth URL.
  - Add `PATCH /admin/message/:id` for guarded message edits.
  - Add outbound update method on `NotificationsService`.
  - Add inbound update method on `InboundEmailService`.

- Frontend:
  - Replace `web/admin/index.html`.
  - Use same-origin API calls with Bearer token.
  - Keep local state for stats, channels, history, inbound, webhooks, selected message, selected channel, and selected webhook.
  - Use explicit confirmation before sending a test notification.

- Verification:
  - Run TypeScript build.
  - Run `node --check` where applicable.
  - Deploy with the service deploy script.
  - Browser-check `/admin` desktop and mobile.

## Future Work

- Add a real template table/controller if central template management remains a product requirement.
- Add audit log rows for admin edits.
- Add delivery attempt detail endpoints for the inspector.
- Add a backend aggregate endpoint for channel health instead of computing a partial view from stats and registry rows.
