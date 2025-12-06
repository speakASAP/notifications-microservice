# Notification Microservice

Centralized notification service for the FlipFlop.cz e-commerce platform. Handles multi-channel notifications via Email, Telegram, and WhatsApp with full history tracking and status monitoring.

## Features

- ✅ **Email Notifications** - Via SendGrid API
- ✅ **Telegram Notifications** - Via Telegram Bot API
- ✅ **WhatsApp Notifications** - Via WhatsApp Business API
- ✅ **Template Support** - Dynamic message templating with variable substitution
- ✅ **Multi-channel** - Support for multiple notification channels
- ✅ **Notification History** - Complete history of all sent notifications
- ✅ **Status Tracking** - Track notification status (pending, sent, failed)
- ✅ **Database Integration** - PostgreSQL storage for notification records
- ✅ **Comprehensive Logging** - Centralized logging via external logging microservice with local fallback

## Technology Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL (via TypeORM)
- **Email**: SendGrid
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

## Environment Variables

See `.env.example` for all required environment variables. Key variables:

```env
# Service Configuration
PORT=3368  # Configured in notifications-microservice/.env (default: 3368)
NODE_ENV=production
CORS_ORIGIN=*

# Database Configuration
DB_HOST=db-server-postgres
DB_PORT=5432
DB_USER=dbadmin
DB_PASSWORD=your_password
DB_NAME=notifications
DB_SYNC=false

# SendGrid Configuration
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@flipflop.cz
SENDGRID_FROM_NAME=FlipFlop.cz

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_BOT_USERNAME=YourBotName
TELEGRAM_CHAT_ID=default_chat_id
TELEGRAM_API_URL=https://api.telegram.org/bot

# WhatsApp Configuration
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_API_URL=https://graph.facebook.com/v18.0

# Logging Configuration
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

The service will automatically create the `notifications` table on first run if `DB_SYNC=true` (development only). For production, use migrations or manually create the table schema.

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
// Example: Email notification
const response = await fetch('https://notifications.statex.cz/notifications/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'email',
    type: 'order_confirmation',
    recipient: 'customer@example.com',
    subject: 'Order Confirmation #12345',
    message: 'Thank you for your order! Your order #12345 has been confirmed.',
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

**Port Range**: 33xx (shared microservices)

| Service | Host Port | Container Port | .env Variable | Description |
|---------|-----------|----------------|---------------|-------------|
| **Notification Service** | `${PORT:-3368}` | `${PORT:-3368}` | `PORT` (notifications-microservice/.env) | Multi-channel notification service |

**Note**:

- All ports are configured in `notifications-microservice/.env`. The values shown are defaults.
- All ports are exposed on `127.0.0.1` only (localhost) for security
- External access is provided via nginx-microservice reverse proxy at `https://notifications.statex.cz`

## Production Deployment

The service is deployed and available at:

- **Production URL**: `https://notifications.statex.cz`
- **Internal URL**: `http://notifications-microservice:${PORT:-3368}` (within Docker network, port configured in `notifications-microservice/.env`)
- **Port**: `${PORT:-3368}` (configured in `notifications-microservice/.env`)

### Quick Deployment Steps

1. **Pull latest code**:

   ```bash
   ssh statex "cd /home/statex/notifications-microservice && git pull origin main"
   ```

2. **Deploy service**:

   ```bash
   ssh statex "cd /home/statex/notifications-microservice && ./scripts/deploy.sh"
   ```

3. **Register domain** (if not already registered):

   ```bash
   # Port configured in notifications-microservice/.env: PORT (default: 3368)
   ssh statex "cd /home/statex/nginx-microservice && ./scripts/add-domain.sh notifications.statex.cz notifications-microservice \${PORT:-3368} admin@statex.cz"
   ```

4. **Verify deployment**:

   ```bash
   curl https://notifications.statex.cz/health
   ```

### Production Environment

- **Server**: Production server accessible via `ssh statex`
- **Container Name**: `notifications-microservice`
- **Network**: Connected to `nginx-network` for internal service communication
- **SSL Certificate**: Managed via Let's Encrypt (auto-renewal configured)
- **Nginx Configuration**: `/home/statex/nginx-microservice/nginx/conf.d/notifications.statex.cz.conf`

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
