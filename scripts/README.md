# Scripts Directory

This directory contains utility scripts for the notifications-microservice.

## Essential Scripts

### Deployment

- **`deploy.sh`** - Production deployment script using blue/green deployment system

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

- **`process-s3-email.ts`** - Manually process an email from S3 bucket
  - Usage: `ts-node scripts/process-s3-email.ts <bucket-name> <object-key>`
- **`find-s3-unprocessed-emails.sh`** - Find S3 objects that were never processed by notifications-microservice (compare S3 bucket with `inbound_emails` by `rawData.receipt.action.objectKey`). Use to trace emails with attachments that stayed in S3.
  - Usage: `./scripts/find-s3-unprocessed-emails.sh` (requires AWS CLI, psql, .env)
  - On prod: `ssh statex "cd ~/notifications-microservice && ./scripts/find-s3-unprocessed-emails.sh"`
- **`reparse-email.ts`** - Re-parse an existing email from database
  - Usage: `ts-node scripts/reparse-email.ts <email-id>`
- **`trace-email-with-attachments.sh`** - Trace why an email (e.g. with attachments) did not reach helpdesk: DB, S3, logs, S3 event config.
  - Usage: `./scripts/trace-email-with-attachments.sh [recipient@domain] [message-id]`

### S3 Event Notifications

- **`setup-s3-events.sh`** - Interactive guide for setting up S3 event notifications
- **`verify-s3-subscription.sh`** - Verify S3 event subscription status
- **`manage-s3-subscriptions.sh`** - Manage S3 subscriptions using AWS CLI (requires AWS CLI and SNS permissions)

## Documentation

- **`README_AWS_CLI.md`** - AWS CLI installation and usage guide

## Usage

All scripts should be run from the project root directory:

```bash
cd notifications-microservice
./scripts/deploy.sh
ts-node scripts/process-s3-email.ts bucket-name object-key
```
