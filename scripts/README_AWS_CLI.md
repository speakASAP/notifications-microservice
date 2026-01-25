# AWS CLI Installation on Production

## Status

✅ **AWS CLI v2.33.6 is installed** on production server

**Installation location**: `~/.local/bin/aws`

**PATH**: Added to `~/.bashrc` (will be available in new shell sessions)

## Usage

### Current Session

```bash
export PATH="$HOME/.local/bin:$PATH"
aws --version
```

### Permanent (after restart/new session)

AWS CLI will be automatically available (PATH is in `.bashrc`)

## AWS Credentials Issue

⚠️ **Current AWS credentials have limited permissions:**

- User: `ses-smtp-user.new_working`
- Permissions: SES SMTP only
- **Missing**: SNS permissions (`sns:ListSubscriptionsByTopic`, `sns:Unsubscribe`, etc.)

### To use AWS CLI for SNS operations

**Option 1: Use AWS Console** (recommended for now)

- Manage subscriptions via AWS Console
- No additional permissions needed

**Option 2: Add SNS permissions to IAM user**

- Go to AWS IAM Console
- Find user: `ses-smtp-user.new_working`
- Add policy: `AmazonSNSReadOnlyAccess` or `AmazonSNSFullAccess`
- Or create custom policy with required SNS permissions

**Option 3: Use different AWS credentials**

- Create new IAM user with SNS permissions
- Configure: `aws configure`
- Or set environment variables:

  ```bash
  export AWS_ACCESS_KEY_ID=...
  export AWS_SECRET_ACCESS_KEY=...
  export AWS_DEFAULT_REGION=eu-central-1
  ```

## Available Commands

Once credentials have proper permissions:

```bash
# List subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn 'arn:aws:sns:eu-central-1:781206275849:s3-email-events' \
  --region eu-central-1

# Delete subscription
aws sns unsubscribe \
  --subscription-arn '<SUBSCRIPTION_ARN>' \
  --region eu-central-1

# Create subscription
aws sns subscribe \
  --topic-arn 'arn:aws:sns:eu-central-1:781206275849:s3-email-events' \
  --protocol https \
  --notification-endpoint 'https://notifications.statex.cz/email/inbound/s3' \
  --attributes '{"RawMessageDelivery":"true"}' \
  --region eu-central-1
```

## Verification

```bash
export PATH="$HOME/.local/bin:$PATH"
aws --version
# Should show: aws-cli/2.33.6 ...
```
