# Notification Microservice Deployment Guide

**Date**: 2025-01-27  
**Purpose**: Complete guide for deploying the notification microservice to production

---

## Overview

This guide covers the complete deployment process for the notification microservice, including database setup, environment configuration, and verification steps.

---

## Prerequisites

1. **Access to Production Server**:
   ```bash
   ssh statex
   ```

2. **Required Services Running**:
   - Database server (PostgreSQL)
   - Nginx microservice (for network connectivity)

3. **Network Configuration**:
   - Service must be on `nginx-network` Docker network
   - DNS resolution working for service discovery

---

## Step 1: Database Setup

### 1.1 Create Database

Connect to the database server and create the notifications database:

```bash
ssh statex
cd /home/statex/database-server
./scripts/create-database.sh notifications notifications_user <strong_password>
```

**Note**: Save the credentials for `.env` configuration.

### 1.2 Verify Database Connection

Test the database connection:

```bash
psql -h db-server-postgres -U notifications_user -d notifications -c "SELECT 1;"
```

---

## Step 2: Environment Configuration

### 2.1 Create .env File

On the production server:

```bash
cd /home/statex/notification-microservice
cp .env.example .env
```

### 2.2 Configure Environment Variables

Edit `.env` file with production values:

```env
# Service Configuration
PORT=3010
NODE_ENV=production
CORS_ORIGIN=*

# Database Configuration
DB_HOST=db-server-postgres
DB_PORT=5432
DB_USER=notifications_user
DB_PASSWORD=<your_password>
DB_NAME=notifications
DB_SYNC=false

# SendGrid Configuration
SENDGRID_API_KEY=<your_sendgrid_api_key>
SENDGRID_FROM_EMAIL=noreply@flipflop.cz
SENDGRID_FROM_NAME=FlipFlop.cz

# Telegram Configuration (optional)
TELEGRAM_BOT_TOKEN=<your_telegram_bot_token>

# WhatsApp Configuration (optional)
WHATSAPP_PHONE_NUMBER_ID=<your_phone_number_id>
WHATSAPP_ACCESS_TOKEN=<your_access_token>
WHATSAPP_API_URL=https://graph.facebook.com/v18.0

# Logging Configuration
LOG_LEVEL=info
```

**Important**: Never commit `.env` file to version control.

---

## Step 3: Deploy Service

### 3.1 Clone/Update Repository

```bash
cd /home/statex/notification-microservice
git pull origin main
```

### 3.2 Deploy Using Script

```bash
./scripts/deploy.sh
```

This script will:
- Build Docker image
- Start the service
- Perform health checks
- Verify deployment

### 3.3 Manual Deployment (Alternative)

```bash
# Build image
docker compose build

# Start service
docker compose up -d

# Check status
docker compose ps
```

---

## Step 4: Verify Network Connectivity

### 4.1 Verify Service is on Network

```bash
docker network inspect nginx-network | grep notification-microservice
```

### 4.2 Test Service Discovery

From another container on the network:

```bash
docker run --rm --network nginx-network alpine/curl:latest \
  curl -s http://notification-microservice:3010/health
```

---

## Step 5: Verification and Testing

### 5.1 Test Health Endpoint

```bash
curl http://notification-microservice:3010/health
```

**Expected Response**:
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "notification-microservice"
}
```

### 5.2 Test Notification Sending

```bash
curl -X POST http://notification-microservice:3010/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "type": "custom",
    "recipient": "test@example.com",
    "subject": "Test Notification",
    "message": "This is a test notification"
  }'
```

### 5.3 Test Notification History

```bash
curl http://notification-microservice:3010/notifications/history?limit=10
```

### 5.4 Test Notification Status

```bash
# First, get a notification ID from history
curl http://notification-microservice:3010/notifications/status/<notification-id>
```

---

## Step 6: Integration with E-commerce

### 6.1 Update E-commerce Configuration

Ensure e-commerce `.env` includes:

```env
NOTIFICATION_SERVICE_URL=http://notification-microservice:3010
```

### 6.2 Test Integration

From e-commerce service:

```bash
docker exec e-commerce-order-service curl http://notification-microservice:3010/health
```

---

## Troubleshooting

### Service Not Starting

**Check logs**:
```bash
docker compose logs notification-service
```

**Common issues**:
- Database connection failed → Check DB credentials
- Port already in use → Check if another service is using port 3010
- Network not connected → Verify service is on nginx-network

### Database Connection Issues

**Test connection**:
```bash
docker exec notification-microservice psql -h db-server-postgres -U notifications_user -d notifications -c "SELECT 1;"
```

**Verify credentials** in `.env` file match database server.

### Health Check Failing

**Check service logs**:
```bash
docker compose logs --tail=50 notification-service
```

**Verify service is running**:
```bash
docker compose ps notification-service
```

### Notification Sending Fails

**Check service-specific logs**:
- Email: Verify SENDGRID_API_KEY is set correctly
- Telegram: Verify TELEGRAM_BOT_TOKEN is valid
- WhatsApp: Verify WhatsApp credentials are correct

**Check notification status**:
```bash
curl http://notification-microservice:3010/notifications/status/<notification-id>
```

---

## Maintenance

### View Logs

```bash
# All logs
docker compose logs notification-service

# Follow logs
docker compose logs -f notification-service

# Last 50 lines
docker compose logs --tail=50 notification-service
```

### Restart Service

```bash
./scripts/restart.sh
```

Or manually:
```bash
docker compose restart notification-service
```

### Update Service

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
./scripts/deploy.sh
```

### Check Service Status

```bash
./scripts/status.sh
```

---

## Monitoring

### Health Checks

The service includes automatic health checks via Docker:

```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3010/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Log Files

Logs are stored in `./logs/` directory:
- `info.log` - Info level logs
- `error.log` - Error level logs
- `all.log` - All logs combined

---

## Backup

### Database Backup

Backup the notifications database:

```bash
pg_dump -h db-server-postgres -U notifications_user notifications > backup_$(date +%Y%m%d).sql
```

### Restore Database

```bash
psql -h db-server-postgres -U notifications_user notifications < backup_YYYYMMDD.sql
```

---

## Security Considerations

1. **Environment Variables**: Never commit `.env` file
2. **API Keys**: Store securely, rotate regularly
3. **Database**: Use strong passwords, limit access
4. **Network**: Service should only be accessible on nginx-network
5. **Logs**: Review logs regularly for security issues

---

## Quick Reference

### Common Commands

```bash
# Deploy
./scripts/deploy.sh

# Start
./scripts/start.sh

# Stop
./scripts/stop.sh

# Restart
./scripts/restart.sh

# Status
./scripts/status.sh

# View logs
docker compose logs -f notification-service
```

### Important Paths

- **Project**: `/home/statex/notification-microservice`
- **Logs**: `./logs/`
- **Environment**: `./.env`

---

## Support

For issues or questions:
- Check logs: `docker compose logs notification-service`
- Review documentation in `/docs`
- Check health endpoint: `curl http://notification-microservice:3010/health`

---

**Last Updated**: 2025-01-27

