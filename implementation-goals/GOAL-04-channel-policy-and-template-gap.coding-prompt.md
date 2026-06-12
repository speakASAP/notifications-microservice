# GOAL-04 Coding Prompt: Channel Policy And Template Gap

Implement Goal 04 in the remote notifications repository.

## Objective

Make channel policy behavior understandable and editable in the admin console, and correct docs that imply persisted template management or wrong webhook routes.

## Required Changes

- Harden `ChannelRegistryService.updateChannel` so admin PATCH can only mutate supported policy/sender fields.
- Improve `web/admin/index.html` channel editor copy with a selected-channel policy summary and explicit note that fallback is stored for operators but not automatically applied by send resolution today.
- Update README/SYSTEM/public landing text to reflect implemented `/notifications/send`, `/webhooks/subscriptions`, and inline `templateData` behavior.

## Validation

Run `npm run build`; run protected read smoke for `/admin/channels` and `/webhooks/subscriptions`; do not run send/test-send actions.
