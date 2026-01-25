# Scripts Directory

This directory contains utility scripts for the notifications-microservice.

## Essential Scripts

### Deployment

- **`deploy.sh`** - Production deployment script using blue/green deployment system

### Email Diagnostics

- **`check-email-receiving.sh`** - Diagnostic tool for AWS SES email receiving configuration
- **`check-sns-subscription.sh`** - Verify SNS subscription status for email receiving

### S3 Email Processing

- **`process-s3-email.ts`** - Manually process an email from S3 bucket
  - Usage: `ts-node scripts/process-s3-email.ts <bucket-name> <object-key>`
- **`reparse-email.ts`** - Re-parse an existing email from database
  - Usage: `ts-node scripts/reparse-email.ts <email-id>`

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
