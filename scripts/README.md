# Scripts Directory

This directory contains utility scripts for the notifications-microservice.

## Essential Scripts

### Deployment

- **`deploy.sh`** - Production deployment script; calls `nginx-microservice/scripts/blue-green/deploy-smart.sh`. Migrations run at app startup (no separate step). SSL via Let's Encrypt (certbot).
- **`update-env-auth-vars.sh`** - Add `AUTH_SERVICE_URL` and `AUTH_SERVICE_PUBLIC_URL` to `.env` if missing (for admin panel). Run on prod: `ssh statex "cd notifications-microservice && ./scripts/update-env-auth-vars.sh"`.

**Restart / rebuild after `git pull`** (service name is `notification-service`; container is `notifications-microservice-blue`):

```bash
cd ~/notifications-microservice
# Rebuild and recreate (picks up new code)
docker compose -f docker-compose.blue.yml up -d --build notification-service
# Or only restart (no rebuild; same image)
docker compose -f docker-compose.blue.yml restart notification-service
```

Use `up -d --build` after a pull; `restart` alone does not rebuild the image.

### Email Diagnostics

- **`check-email-receiving.sh`** - Diagnostic tool for AWS SES email receiving configuration
- **`check-sns-subscription.sh`** - Verify SNS subscription status for email receiving

### S3 Email Processing

- **`drain-all-undelivered.sh`** - Loop process-undelivered until every email is in DB and delivered to helpdesk (all old S3 + DB backlog). Uses `PORT` from `.env` for localhost URL (same as other apps). Before draining set `S3_CATCHUP_DISABLED=true` and restart. Run on prod: `cd ~/notifications-microservice && ./scripts/drain-all-undelivered.sh` (optional: `DB_BATCH=100 S3_BATCH=100` or `NOTIFICATIONS_BASE_URL=...`).
- **`process-all-undelivered.ts`** - Process all undelivered emails from DB (redeliver to helpdesk) and from S3 (fetch, store, webhook). Use after redeploy.
  - Usage: `npx ts-node scripts/process-all-undelivered.ts [dbLimit] [s3MaxKeys]` (defaults: 5, 5)
  - On prod: `ssh statex 'cd ~/notifications-microservice && npx ts-node scripts/process-all-undelivered.ts'`
- **`process-s3-email.ts`** - Manually process an email from S3 bucket
  - Usage: `ts-node scripts/process-s3-email.ts <bucket-name> <object-key>`
- **`find-s3-unprocessed-emails.sh`** - Find S3 objects that were never processed by notifications-microservice (compare S3 bucket with `inbound_emails` by `rawData.receipt.action.objectKey`). Use to trace emails with attachments that stayed in S3.
  - Usage: `./scripts/find-s3-unprocessed-emails.sh` (requires AWS CLI, psql, .env)
  - On prod: `ssh statex "cd ~/notifications-microservice && ./scripts/find-s3-unprocessed-emails.sh"`
- **`reparse-email.ts`** - Re-parse an existing email from database
  - Usage: `ts-node scripts/reparse-email.ts <email-id>`
- **`trace-email-with-attachments.sh`** - Trace why an email (e.g. with attachments) did not reach helpdesk: DB, S3, logs, S3 event config.
  - Usage: `./scripts/trace-email-with-attachments.sh [recipient@domain] [message-id]`
- **`delete-bounce-notifications.sh`** - Delete from DB all "Delivery Status Notification (Failure)" from <MAILER-DAEMON@amazonses.com> so they are never delivered. Run on prod: `cd ~/notifications-microservice && ./scripts/delete-bounce-notifications.sh`
- **`count-undelivered-emails.sh`** - Count inbound emails in DB not yet delivered to helpdesk (no quoting issues). Run on prod: `cd ~/notifications-microservice && ./scripts/count-undelivered-emails.sh`
- **`check-undelivered-to-helpdesk.sh`** - List inbound emails sent to helpdesk webhook but not yet confirmed delivered (helpdesk calls delivery-confirmation when ticket/comment is created).
  - Usage: `./scripts/check-undelivered-to-helpdesk.sh [limit]`
  - On prod: `ssh statex 'cd ~/notifications-microservice && ./scripts/check-undelivered-to-helpdesk.sh'`
- **`trace-email-helpdesk.sh`** - Trace where a specific email is stuck (not in DB / in DB but no helpdesk delivery / delivery status). Uses Message-Id or from+to (last 7 days).
  - Usage: `./scripts/trace-email-helpdesk.sh "<message-id>"` or `./scripts/trace-email-helpdesk.sh "" "from@example.com" "to@example.com"`
  - On prod: `cd ~/notifications-microservice && ./scripts/trace-email-helpdesk.sh "1772359319.0556817000.g9aprhbf@frv63.fwdcdn.com"`
- **`update-helpdesk-subscription-filter.sh`** - Set helpdesk webhook subscription `filters.to` to `["*@speakasap.com"]` so all inbound emails to any @speakasap.com address (including contact@, stashok@) are delivered to Helpdesk. See `docs/EMAIL_DELIVERY_POLICY.md`.
  - Usage: `./scripts/update-helpdesk-subscription-filter.sh`
  - On prod: `ssh statex 'cd ~/notifications-microservice && ./scripts/update-helpdesk-subscription-filter.sh'`
- **`trace-webhook-flow.sh`** - Print recent logs for the inbound-email → webhook delivery flow to find where it hangs when a ticket does not appear. See also `docs/TRACE_WEBHOOK_HANG.md`.
  - Usage: `./scripts/trace-webhook-flow.sh` or `LINES=500 ./scripts/trace-webhook-flow.sh`
  - On prod: `ssh statex 'cd ~/notifications-microservice && ./scripts/trace-webhook-flow.sh'`

### S3 Event Notifications

- **`setup-s3-events.sh`** - Interactive guide for setting up S3 event notifications
- **`verify-s3-subscription.sh`** - Verify S3 event subscription status
- **`manage-s3-subscriptions.sh`** - Manage S3 subscriptions using AWS CLI (requires AWS CLI and SNS permissions)

### Admin Panel Testing

To test the admin panel (`/admin/`):

1. Create a test user in auth-microservice: `cd ../auth-microservice && ./scripts/create-test-user.sh` (uses TEST_EMAIL and TEST_PASSWORD from auth-microservice `.env`).
2. Ensure notifications-microservice `.env` has `AUTH_SERVICE_URL` and `AUTH_SERVICE_PUBLIC_URL` (run `./scripts/update-env-auth-vars.sh` if needed).
3. Open `https://${DOMAIN}/admin/` and sign in with the test user. You should see statistics, message history, and service parameters.

## Documentation

- **`README_AWS_CLI.md`** - AWS CLI installation and usage guide

## Usage

All scripts should be run from the project root directory:

```bash
cd notifications-microservice
./scripts/deploy.sh
ts-node scripts/process-s3-email.ts bucket-name object-key
```
