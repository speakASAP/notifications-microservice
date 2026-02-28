# Notification Microservice

Centralized notification service for the FlipFlop.cz flipflop platform. Handles multi-channel notifications via Email, Telegram, and WhatsApp with full history tracking and status monitoring.

## Features

- ✅ **Email Notifications** - Via SendGrid API and AWS SES (multi-provider support)
- ✅ **Inbound Email Handling** - Receive emails via AWS SES SNS webhook
- ✅ **Email Provider Selection** - Choose provider per-request or via environment variable
- ✅ **Telegram Notifications** - Via Telegram Bot API
- ✅ **WhatsApp Notifications** - Via WhatsApp Business API
- ✅ **Template Support** - Dynamic message templating with variable substitution
- ✅ **Multi-channel** - Support for multiple notification channels
- ✅ **Notification History** - Complete history of all sent notifications
- ✅ **Status Tracking** - Track notification status (pending, sent, failed)
- ✅ **Database Integration** - PostgreSQL storage for notification records
- ✅ **Comprehensive Logging** - Centralized logging via external logging microservice with local fallback
- ✅ **Web Interface** - Landing page for potential customers and admin panel with auth-microservice login
- ✅ **Admin Panel** - Statistics, message history, and service parameters (JWT-protected)

## Web Interface

The service serves a web UI at the same domain (`DOMAIN` from `.env`):

- **Landing** (`/`) – Multi-channel overview and quick start for potential customers
- **Admin** (`/admin/`) – Sign in via auth-microservice; view statistics, message history, and service parameters

Admin endpoints (`GET /admin/stats`, `GET /admin/history`, `GET /admin/params`) require a valid JWT from auth-microservice. Set `AUTH_SERVICE_URL` (backend validation) and `AUTH_SERVICE_PUBLIC_URL` (browser login URL) in `.env`.

## Technology Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL (via TypeORM)
- **Email**: SendGrid and AWS SES (multi-provider support)
- **Telegram**: Telegram Bot API
- **WhatsApp**: WhatsApp Business API (Meta)
- **Logging**: External centralized logging microservice with local file fallback

## API Endpoints

### Send Notification

```text
POST /notifications/send
```

**Request Body**:

```json
{
  "channel": "email|telegram|whatsapp",
  "type": "order_confirmation|payment_confirmation|order_status_update|shipment_tracking|custom",
  "recipient": "email@example.com|+420123456789|telegram_chat_id",
  "subject": "Notification Subject (optional for non-email)",
  "message": "Notification message with {{template}} variables",
  "templateData": {
    "template": "value"
  },
  "emailProvider": "sendgrid|ses|auto",
  "contentType": "text/html|text/plain",
  "botToken": "optional-per-request-bot-token",
  "chatId": "optional-chat-id-alternative-to-recipient",
  "parseMode": "HTML|Markdown|MarkdownV2",
  "inlineKeyboard": [
    [
      {
        "text": "Button Text",
        "url": "https://example.com"
      }
    ]
  ]
}
```

**Email Provider Selection** (optional, for email channel only):

- `emailProvider`: Choose email provider for this request
  - `"sendgrid"` - Use SendGrid (default if not specified)
  - `"ses"` - Use AWS SES
  - `"auto"` - Try AWS SES first, fallback to SendGrid on failure
  - If not specified, uses `EMAIL_PROVIDER` environment variable or defaults to `"sendgrid"`

**Email Content Type** (optional, for email channel only):

- `contentType`: Specify the content type of the message
  - `"text/html"` - Message is HTML (will be sent as HTML, plain text version auto-generated)
  - `"text/plain"` - Message is plain text (will be converted to HTML for email clients)
  - If not specified, will auto-detect based on message content (checks for HTML tags)
  - Auto-detection: If message contains HTML tags (`<tag>`), treats as `"text/html"`, otherwise `"text/plain"`

**Telegram-Specific Fields** (optional):

- `botToken`: Per-request bot token (overrides global TELEGRAM_BOT_TOKEN from .env)
- `chatId`: Chat ID (alternative to recipient field for Telegram)
- `parseMode`: Message parse mode - "HTML", "Markdown", or "MarkdownV2" (default: "HTML")
- `inlineKeyboard`: Array of button rows, each row is an array of button objects with:
  - `text`: Button text (required)
  - `url`: URL to open when button is clicked
  - `callback_data`: Data to send in callback query
  - Other Telegram button options (web_app, login_url, etc.)

**Response**:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "sent",
    "channel": "email",
    "recipient": "user@example.com",
    "messageId": "external-message-id"
  }
}
```

### Get Notification History

```text
GET /notifications/history?limit=50&offset=0
```

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "channel": "email",
      "type": "order_confirmation",
      "recipient": "user@example.com",
      "subject": "Order Confirmation",
      "status": "sent",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Get Notification Status

```text
GET /notifications/status/:id
```

**Response**:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "sent",
    "channel": "email",
    "recipient": "user@example.com",
    "error": null,
    "messageId": "external-message-id",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Frontend Config (public)

```text
GET /api/config
```

Returns `authServicePublicUrl` and `domain` for the web UI. No auth required.

### Admin Endpoints (JWT required)

All admin endpoints require `Authorization: Bearer <accessToken>` from auth-microservice login.

**GET /admin/stats** – Aggregated statistics (total, by channel, by status, by type, last 24h, last 7d).

**GET /admin/history?limit=50&offset=0** – Notification history for admin panel.

**GET /admin/params** – Non-secret service parameters (email provider, channels configured, version, etc.).

### Inbound Email Webhook (AWS SES SNS)

```text
POST /email/inbound
```

**Description**: AWS SES SNS webhook endpoint for receiving inbound emails. AWS SES sends notifications via Amazon SNS when emails are received.

**Request**: AWS SNS notification (handled automatically)

**Response**:

```json
{
  "status": "processed",
  "message": "Email notification processed"
}
```

**Setup**:

1. Configure AWS SES to send notifications to an SNS topic
2. Configure SNS topic to send HTTP(S) POST requests to `https://notifications.statex.cz/email/inbound`
3. The service will automatically confirm SNS subscription and process inbound emails
4. Inbound emails are stored in the `inbound_emails` database table

## Environment Variables

See `.env.example` for all required environment variables. Key variables:

```env
# Service Domain - Used by nginx-microservice for auto-registry (required for correct domain detection)
DOMAIN=notifications.statex.cz

# Service Name - Used for logging and service identification
SERVICE_NAME=notifications-microservice

# Service Configuration
PORT=3368  # Reserved port for notifications-microservice (33xx range)
NODE_ENV=production
CORS_ORIGIN=*

# Auth (admin panel - required for /admin/ login and JWT validation)
AUTH_SERVICE_URL=http://auth-microservice:3370
AUTH_SERVICE_PUBLIC_URL=https://auth.statex.cz

# Database Configuration
DB_HOST=db-server-postgres
DB_PORT=5432
DB_USER=dbadmin
DB_PASSWORD=your_password
DB_NAME=notifications
DB_SYNC=false

# Email Provider Selection (sendgrid|ses|auto)
EMAIL_PROVIDER=auto

# SendGrid Configuration
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@flipflop.cz
SENDGRID_FROM_NAME=FlipFlop.cz

# AWS SES Configuration
AWS_SES_REGION=eu-central-1
AWS_SES_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SES_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_SES_FROM_EMAIL=contact@speakasap.com
AWS_SES_FROM_NAME=SpeakASAP
AWS_SES_SNS_TOPIC_ARN=arn:aws:sns:eu-central-1:{12-digits amazon-ID}}:inbound-email-speakasap
AWS_SES_S3_BUCKET=speakasap-email-forward
AWS_SES_S3_OBJECT_KEY_PREFIX=forwards/

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_BOT_USERNAME=YourBotName
TELEGRAM_CHAT_ID=default_chat_id
TELEGRAM_API_URL=https://api.telegram.org/bot

# WhatsApp Configuration
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_API_URL=https://graph.facebook.com/v18.0

# Auth (admin panel login and JWT validation)
AUTH_SERVICE_URL=http://auth-microservice:3370
AUTH_SERVICE_PUBLIC_URL=https://auth.statex.cz

# Logging Configuration (central logging-microservice; port 3367, same for blue/green)
LOG_LEVEL=info
LOGGING_SERVICE_URL=http://logging-microservice:${PORT:-3367}  # PORT configured in logging-microservice/.env
```

## Running the Service

### Development

```bash
npm install
npm run start:dev
```

### Production

```bash
npm run build
npm run start:prod
```

### Docker (Development)

```bash
docker compose up -d
```

### Deployment Scripts

The project includes deployment scripts in the `scripts/` directory:

- `./scripts/deploy.sh` - Full deployment with health checks (builds Docker image, starts container, verifies health)
- `./scripts/status.sh` - Check service status and health endpoint
- `./scripts/test-telegram.sh` - Test Telegram notification integration
- `./scripts/test-integration.py` - Python integration test script
- `./scripts/verify-integration.sh` - Verify service integration with other microservices

## Database Setup

The service requires a PostgreSQL database. Create the database:

```sql
CREATE DATABASE notifications;
```

The service will automatically create the `notifications` and `inbound_emails` tables on first run if `DB_SYNC=true` (development only). For production, use migrations or manually create the table schema.

## AWS SES Configuration

### Email Sending Setup

1. **Create AWS SES credentials**:
   - Go to AWS IAM Console
   - Create a new user with SES sending permissions
   - Generate access key ID and secret access key
   - Add credentials to `.env`:

     ```env
     AWS_SES_REGION=eu-central-1
     AWS_SES_ACCESS_KEY_ID=your_access_key_id
     AWS_SES_SECRET_ACCESS_KEY=your_secret_access_key
     AWS_SES_FROM_EMAIL=noreply@speakasap.com
     AWS_SES_FROM_NAME=SpeakASAP
     AWS_SES_S3_BUCKET=speakasap-email-forward
     AWS_SES_S3_OBJECT_KEY_PREFIX=forwards/
     ```

2. **Verify sender email**:
   - In AWS SES Console, verify the sender email address (`AWS_SES_FROM_EMAIL`)
   - If in sandbox mode, also verify recipient email addresses

3. **Provider Selection**:
   - Set `EMAIL_PROVIDER` environment variable to `ses`, `sendgrid`, or `auto`
   - Or specify `emailProvider` per-request in API calls
   - `auto` mode tries SES first, falls back to SendGrid on failure

### Inbound Email Setup

1. **Create S3 Bucket for Email Storage** (Recommended - prevents email loss):
   - Go to AWS S3 Console
   - Create a new bucket (e.g., `speakasap-inbound-emails`)
   - Configure bucket policy to allow SES to write:

     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Sid": "AllowSESPuts",
           "Effect": "Allow",
           "Principal": {
             "Service": "ses.amazonaws.com"
           },
           "Action": "s3:PutObject",
           "Resource": "arn:aws:s3:::speakasap-inbound-emails/*",
           "Condition": {
             "StringEquals": {
               "aws:Referer": "YOUR_AWS_ACCOUNT_ID"
             }
           }
         }
       ]
     }
     ```

   - Enable versioning (optional but recommended for recovery)
   - Configure lifecycle policies if needed (e.g., move to Glacier after 90 days)

2. **Create SNS Topic**:
   - Go to AWS SNS Console
   - Create a new topic (e.g., `inbound-email`)
   - Note the topic ARN

3. **Configure SES Receiving Rule with S3 and SNS**:
   - Go to AWS SES Console → Email Receiving → Rule Sets
   - Create a new rule set (or use default)
   - Create a rule that:
     - Matches all recipients (or specific domain like `@speakasap.com`)
     - **Action 1: Save to S3 bucket** (IMPORTANT: Add this action FIRST):
       - Action type: "Save to S3 bucket"
       - S3 bucket: Select the bucket created in step 1 (e.g., `speakasap-email-forward`)
       - Object key prefix: `forwards/` (optional, for organization - must match `AWS_SES_S3_OBJECT_KEY_PREFIX`)
       - KMS key: (optional, for encryption)
     - **Action 2: Publish to SNS topic** (Add this action SECOND):
       - Action type: "Publish to SNS topic"
       - SNS topic: Select the topic created in step 2
   - **Important**: The order matters - S3 action should be before SNS action to ensure emails are saved even if SNS fails
   - **Note**: When both S3 and SNS actions are configured:
     - Emails are saved to S3 first, then notification is sent via SNS
     - For emails > 150 KB, SNS notification may not include email content
     - **S3-First Strategy**: The service automatically fetches email content from S3 if bucket is configured
     - **Recommended**: Configure `AWS_SES_S3_BUCKET` and `AWS_SES_S3_OBJECT_KEY_PREFIX` in `.env` to ensure S3 fetching works even if bucket info is missing from notification
     - This ensures all emails (including large ones with attachments) are processed correctly
     - See [S3-First Strategy Guide](docs/S3_FIRST_STRATEGY.md) for details

4. **Configure SNS to send to webhook**:
   - Go to AWS SNS Console → Subscriptions
   - Create subscription:
     - Protocol: HTTPS
     - Endpoint: `https://notifications.statex.cz/email/inbound`
     - Enable raw message delivery: **Yes (recommended)** or No (both formats supported)
     - **Recommended: Yes** - Raw delivery ensures original message is received without any transformation, reducing risk of data loss

5. **Confirm Subscription**:
   - AWS SNS will send a subscription confirmation to the webhook
   - The service automatically confirms the subscription
   - Check SNS console to verify subscription is confirmed

6. **Test Inbound Email**:
   - Send an email to the verified recipient
   - Check the `inbound_emails` table in the database
   - Check service logs for processing status
   - Verify email is saved in S3 bucket

### Email Recovery from S3

If an email was not processed correctly but was saved to S3:

1. **Locate the email in S3**:
   - Go to AWS S3 Console
   - Navigate to your inbound emails bucket
   - Find the email object (usually named with timestamp and message ID)

2. **Download and inspect**:
   - Download the email file from S3
   - The file contains the raw MIME email content

3. **Manual reprocessing** (if needed):
   - **Option 1**: Use the API endpoint: `POST /email/inbound/s3` with body `{ "bucket": "bucket-name", "key": "object-key" }`
   - **Option 2**: Use the script: `ts-node scripts/process-s3-email.ts <bucket-name> <object-key>`
   - **Option 3**: Use the reparse endpoint: `POST /email/inbound/:id/reparse` (if email already exists in database)

### Periodic S3 Sync (Ensure No Emails Missed)

The service runs a **scheduled task** every 5 minutes (`S3_CATCHUP_CRON`, default `*/5 * * * *`) that:

- Lists S3 objects in the configured bucket/prefix (with pagination)
- Keeps only objects from the **last 24 hours** (by `LastModified`)
- Compares with `inbound_emails` (by `rawData.receipt.action.objectKey`) and processes any S3 object not yet in the database (fetch from S3 → store as raw email → webhook to helpdesk)

So **everything in S3 from the last day is kept in sync with the database**: no single email from the last 24h should be missed. Configure `S3_CATCHUP_MAX_KEYS_PER_RUN` (default 10, max 100) and `S3_CATCHUP_CRON` in `.env` if needed. For full backlog catchup (all time), use `POST /email/inbound/process-undelivered` or `npx ts-node scripts/process-all-undelivered.ts`.

### S3 Event Notifications Setup (Recommended for Large Emails)

For emails larger than 150 KB, AWS SES may not send SNS notifications. To ensure all emails are processed automatically:

1. **Create SNS Topic for S3 Events** (or reuse existing):
   - Go to AWS SNS Console
   - Create a new topic (e.g., `s3-email-events`)
   - Note the topic ARN

2. **Configure S3 Bucket Event Notifications**:
   - Go to AWS S3 Console → Your bucket (`speakasap-email-forward`)
   - Go to Properties → Event notifications
   - Create event notification:
     - **Event name**: `ProcessInboundEmails`
     - **Event types**: Select `s3:ObjectCreated:*` (or just `s3:ObjectCreated:Put`)
     - **Prefix**: `forwards/` (matches your object key prefix)
     - **Destination**: SNS topic → Select your SNS topic (`s3-email-events`)

3. **Configure SNS Subscription**:
   - Go to AWS SNS Console → Subscriptions
   - Create subscription:
     - Protocol: HTTPS
     - Endpoint: `https://notifications.statex.cz/email/inbound/s3`
     - Enable raw message delivery: **Yes** (for S3 events)

4. **Verify Configuration**:
   - Send a test email with attachment (>150 KB)
   - Check S3 bucket for the email
   - Check service logs for S3 event processing
   - Verify email appears in database and helpdesk

**How It Works**:

- When an email is saved to S3, S3 sends an event notification to SNS
- SNS forwards the notification to the service endpoint `/email/inbound/s3`
- The service fetches the email from S3 and processes it
- This ensures emails > 150 KB are processed even if SNS notification fails

**Benefits of S3 Storage**:

- ✅ **No email loss**: All emails are saved to S3 before processing
- ✅ **Recovery**: Can recover emails even if processing fails
- ✅ **Audit trail**: Complete history of all received emails
- ✅ **Compliance**: Long-term storage for compliance requirements

## Integration Examples

### Basic Telegram Notification

```typescript
// Example: Basic Telegram notification
const response = await fetch('https://notifications.statex.cz/notifications/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'telegram',
    type: 'custom',
    recipient: '694579866',
    message: 'Hello! This is a test message.'
  })
});

const result = await response.json();
console.log(result);
```

### Telegram with Inline Keyboard

```typescript
// Example: Telegram notification with inline keyboard buttons
const response = await fetch('https://notifications.statex.cz/notifications/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'telegram',
    type: 'custom',
    recipient: '694579866',
    message: 'Your prototype is ready!',
    inlineKeyboard: [
      [
        { text: '📊 View Dashboard', url: 'https://statex.ai/dashboard' }
      ],
      [
        { text: '🤖 View Results', url: 'https://statex.ai/prototype/123' }
      ]
    ]
  })
});

const result = await response.json();
console.log(result);
```

### Telegram with User-Specific Bot Token

```typescript
// Example: Using per-request bot token (for user-specific credentials)
const response = await fetch('https://notifications.statex.cz/notifications/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'telegram',
    type: 'custom',
    recipient: 'user_chat_id',
    message: 'Price alert triggered!',
    botToken: 'user_specific_bot_token',  // Overrides global token
    parseMode: 'HTML'
  })
});

const result = await response.json();
console.log(result);
```

### Python Integration (statex/crypto-ai-agent)

```python
import requests

# Send Telegram notification via microservice
payload = {
    "channel": "telegram",
    "type": "custom",
    "recipient": chat_id,
    "chatId": chat_id,
    "message": message,
    "botToken": bot_token,  # Optional: user-specific token
    "parseMode": "HTML",
    "inlineKeyboard": [
        [
            {"text": "View Dashboard", "url": "https://statex.ai/dashboard"}
        ]
    ]
}

response = requests.post(
    "https://notifications.statex.cz/notifications/send",
    json=payload,
    timeout=10
)

result = response.json()
print(result)
```

### Email Notification

```typescript
// Example: Email notification via SendGrid (default) - plain text
const response = await fetch('https://notifications.statex.cz/notifications/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'email',
    type: 'order_confirmation',
    recipient: 'customer@example.com',
    subject: 'Order Confirmation #12345',
    message: 'Thank you for your order! Your order #12345 has been confirmed.',
    contentType: 'text/plain', // Optional: auto-detected if not specified
    templateData: {
      orderNumber: '12345',
      customerName: 'John Doe'
    }
  })
});

const result = await response.json();
console.log(result);
```

### Email with HTML Content

```typescript
// Example: Email notification with HTML content
const response = await fetch('https://notifications.statex.cz/notifications/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'email',
    type: 'order_confirmation',
    recipient: 'customer@example.com',
    subject: 'Order Confirmation #12345',
    message: '<html><body><h1>Thank you for your order!</h1><p>Your order #12345 has been confirmed.</p></body></html>',
    contentType: 'text/html', // Explicitly specify HTML content
    templateData: {
      orderNumber: '12345',
      customerName: 'John Doe'
    }
  })
});

const result = await response.json();
console.log(result);
```

### Email via AWS SES

```typescript
// Example: Email notification via AWS SES
const response = await fetch('https://notifications.statex.cz/notifications/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'email',
    type: 'order_confirmation',
    recipient: 'customer@example.com',
    subject: 'Order Confirmation #12345',
    message: 'Thank you for your order! Your order #12345 has been confirmed.',
    emailProvider: 'ses', // Use AWS SES
    templateData: {
      orderNumber: '12345',
      customerName: 'John Doe'
    }
  })
});

const result = await response.json();
console.log(result);
```

### Email with Auto Provider Selection

```typescript
// Example: Email with auto provider (tries SES first, falls back to SendGrid)
const response = await fetch('https://notifications.statex.cz/notifications/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'email',
    type: 'order_confirmation',
    recipient: 'customer@example.com',
    subject: 'Order Confirmation #12345',
    message: 'Thank you for your order! Your order #12345 has been confirmed.',
    emailProvider: 'auto', // Try SES, fallback to SendGrid
    templateData: {
      orderNumber: '12345',
      customerName: 'John Doe'
    }
  })
});

const result = await response.json();
console.log(result);
```

## 🔌 Port Configuration

**Port Range**: 33xx (shared microservices). **Reserved port for notifications-microservice: 3368.**

| Service | Host Port | Container Port | .env Variable | Description |
| ------- | --------- | -------------- | ------------- | ----------- |
| **Notification Service** | `${PORT:-3368}` | `${PORT:-3368}` | `PORT` (notifications-microservice/.env) | Multi-channel notification service |

**Note**:

- All ports are configured in `notifications-microservice/.env`. The values shown are defaults.
- Port **3368** is the reserved address for this service (do not change unless coordinated with nginx-microservice).
- All ports are exposed on `127.0.0.1` only (localhost) for security.
- External access is provided via nginx-microservice reverse proxy at `https://${DOMAIN}` (e.g. `https://notifications.statex.cz`).

## Production Deployment

The service is deployed using **nginx-microservice** blue/green deployment:

- **Deploy script**: `./scripts/deploy.sh` calls `nginx-microservice/scripts/blue-green/deploy-smart.sh`.
- **SSL**: Let's Encrypt (certbot). A temporary self-signed cert is created first so nginx can start; then the deployment requests a real certificate. Set `CERTBOT_EMAIL` in `nginx-microservice/.env` for Let's Encrypt (e.g. `admin@statex.cz`). Certificates are not self-signed in production once certbot runs successfully.

The service is available at:

- **Production URL**: `https://${DOMAIN}` (e.g. `https://notifications.statex.cz`)
- **Internal URL**: `http://notifications-microservice:${PORT:-3368}` (within Docker network)
- **Port**: `${PORT:-3368}` (configured in `notifications-microservice/.env`)

### Quick Deployment Steps

1. **Update .env on prod** (include auth vars for admin panel):

   ```bash
   ssh statex "cd /home/statex/notifications-microservice && ./scripts/update-env-auth-vars.sh"
   ```

   Ensure `DOMAIN`, `AUTH_SERVICE_URL`, and `AUTH_SERVICE_PUBLIC_URL` are set (see Environment Variables).

2. **Pull latest code**:

   ```bash
   ssh statex "cd /home/statex/notifications-microservice && git pull origin main"
   ```

3. **Deploy service** (uses deploy-smart.sh; SSL via Let's Encrypt):

   ```bash
   ssh statex "cd /home/statex/notifications-microservice && ./scripts/deploy.sh"
   ```

4. **Register domain** (if not already registered; registry may be auto-created from service .env):

   ```bash
   ssh statex "cd /home/statex/nginx-microservice && ./scripts/add-domain.sh notifications.statex.cz notifications-microservice 3368 admin@statex.cz"
   ```

5. **Verify deployment**:

   ```bash
   curl https://notifications.statex.cz/health
   ```

### Production Environment

- **Server**: Production server accessible via `ssh statex`
- **Container Name**: `notifications-microservice` (blue/green: `-blue` / `-green`)
- **Network**: Connected to `nginx-network` for internal service communication
- **SSL Certificate**: Let's Encrypt via certbot (see nginx-microservice; temporary self-signed only until certbot succeeds)
- **Nginx Configuration**: Generated by deploy-smart.sh (e.g. `nginx-microservice/nginx/conf.d/notifications.statex.cz.conf`)

### Testing Admin Panel

1. **Create a test user** in auth-microservice (use auth-microservice script or API):

   ```bash
   # On prod or where auth-microservice is running:
   cd /path/to/auth-microservice && ./scripts/create-test-user.sh
   # Uses TEST_EMAIL and TEST_PASSWORD from auth-microservice .env
   ```

   Or register via API:

   ```bash
   curl -X POST https://auth.statex.cz/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"YourSecurePassword","firstName":"Admin","lastName":"User"}'
   ```

2. **Open admin**: `https://notifications.statex.cz/admin/`

3. **Sign in** with the same email/password. After login you should see statistics, message history, and service parameters.

For detailed deployment instructions, see [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Health Check

The service provides a health check endpoint:

```text
GET /health
```

Returns:

```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "notifications-microservice"
}
```

## Logs

The service uses a centralized logging system that integrates with the external logging microservice (`../logging-microservice/`). Logs are sent to the logging microservice via HTTP API and also stored locally as a fallback.

### Logging Configuration

- **External Logging**: Logs are sent to `http://logging-microservice:${PORT:-3367}/api/logs` (port configured in `logging-microservice/.env`, configured via `LOGGING_SERVICE_URL`)
- **Local Fallback**: If the logging service is unavailable, logs are written to local files in `./logs/` directory
- **Service Name**: All logs are tagged with service name `notifications-microservice`

### Local Log Files

Logs are stored in the `./logs/` directory as fallback:

- `info.log` - Info level logs
- `error.log` - Error level logs
- `all.log` - All logs combined

### Log Format

Logs sent to the external service include:

- **level**: `error`, `warn`, `info`, `debug`
- **message**: Log message text
- **service**: `notifications-microservice`
- **timestamp**: ISO 8601 timestamp
- **metadata**: Additional context (service name, stack traces for errors)

## Support

For issues and questions, please refer to the documentation in the `docs/` directory or open an issue on GitHub.
