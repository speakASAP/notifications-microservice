# Email Delivery Policy

## All *@speakasap.com to Helpdesk

All inbound emails to any `*@speakasap.com` address (including `stashok@speakasap.com`, `contact@speakasap.com`, etc.) are delivered to the helpdesk via webhook. There is **no per-address forwarding** to external addresses (e.g. no forwarding from `stashok@speakasap.com` to `ssfskype@gmail.com`).

## Configuration

- **Helpdesk subscription filter**: `filters.to = ["*@speakasap.com"]` (set via `scripts/update-helpdesk-subscription-filter.sh`).
- **EMAIL_FORWARDING_RULES**: Not used. This variable has been removed. If it appears in `.env`, remove it; all speakasap emails go to the helpdesk only.

## WEBHOOK_TIMEOUT_ALERT_EMAIL

`WEBHOOK_TIMEOUT_ALERT_EMAIL` (default: `ssfskype@gmail.com`) is used only for **timeout alerts** when webhook delivery to the helpdesk fails or times out. It is not used for forwarding inbound emails.
