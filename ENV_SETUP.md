# Environment Variables Setup

## Creating .env File

Since `.env` files are typically in `.gitignore`, you need to create it manually.

### Option 1: Copy from Example (if .env.example exists)

```bash
cp .env.example .env
```

### Option 2: Create Manually

Create a `.env` file in the root directory with the following content:

```env
# Service Configuration
PORT=3010
NODE_ENV=production
CORS_ORIGIN=*

# Database Configuration
DB_HOST=db-server-postgres
DB_PORT=5432
DB_USER=dbadmin
DB_PASSWORD=your_password_here
DB_NAME=notifications
DB_SYNC=false

# SendGrid Configuration
SENDGRID_API_KEY=your_sendgrid_api_key_here
SENDGRID_FROM_EMAIL=noreply@flipflop.cz
SENDGRID_FROM_NAME=FlipFlop.cz

# Telegram Configuration (optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# WhatsApp Configuration (optional)
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_API_URL=https://graph.facebook.com/v18.0

# Logging Configuration
LOG_LEVEL=info
```

### Important Notes

- Replace all placeholder values with actual credentials
- Never commit `.env` file to version control
- For production, use secure credential management
- Database password should be strong and unique
- API keys should be kept secure

