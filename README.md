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
- ✅ **Comprehensive Logging** - Centralized logging for all operations

## Technology Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL (via TypeORM)
- **Email**: SendGrid
- **Telegram**: Telegram Bot API
- **WhatsApp**: WhatsApp Business API (Meta)
- **Logging**: Custom logger service

## API Endpoints

### Send Notification
```
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
  }
}
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
    "messageId": "external-message-id"
  }
}
```

### Get Notification History
```
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
```
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
PORT=3010
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

# WhatsApp Configuration
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_API_URL=https://graph.facebook.com/v18.0

# Logging Configuration
LOG_LEVEL=info
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

- `./scripts/deploy.sh` - Full deployment with health checks
- `./scripts/start.sh` - Start the service
- `./scripts/stop.sh` - Stop the service
- `./scripts/restart.sh` - Restart the service
- `./scripts/status.sh` - Check service status and health

## Database Setup

The service requires a PostgreSQL database. Create the database:

```sql
CREATE DATABASE notifications;
```

The service will automatically create the `notifications` table on first run if `DB_SYNC=true` (development only). For production, use migrations or manually create the table schema.

## Integration with E-commerce Platform

The e-commerce platform integrates with this service via HTTP:

```typescript
// Example integration
const response = await fetch('http://notification-microservice:3010/notifications/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'email',
    type: 'order_confirmation',
    recipient: 'customer@example.com',
    subject: 'Order Confirmation',
    message: 'Your order #{{orderNumber}} has been confirmed.',
    templateData: {
      orderNumber: '12345'
    }
  })
});
```

## Production Deployment

For production deployment instructions, see [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Health Check

The service provides a health check endpoint:

```
GET /health
```

Returns:
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "notification-microservice"
}
```

## Logs

Logs are stored in the `./logs/` directory:
- `info.log` - Info level logs
- `error.log` - Error level logs
- `all.log` - All logs combined

## Support

For issues and questions, please refer to the documentation in the `docs/` directory or open an issue on GitHub.
