# E-commerce Integration Guide

**Date**: 2025-11-14  
**Purpose**: Guide for integrating notification microservice with e-commerce platform

---

## ✅ Current Status

### Notification Microservice
- **Status**: ✅ Running and healthy
- **URL**: `http://notification-microservice:3010`
- **Network**: Connected to `nginx-network`
- **Database**: Connected to `notifications` database

### E-commerce Platform
- **Status**: ⚠️ Services not currently running on production
- **Integration**: Ready (code already configured)

---

## 🔧 E-commerce Configuration

### Automatic Configuration

The e-commerce platform **already has default configuration** for the notification service:

**File**: `shared/notifications/notification.service.ts`
```typescript
this.notificationServiceUrl =
  this.configService.get<string>('NOTIFICATION_SERVICE_URL') ||
  'http://notification-microservice:3010';
```

**Default Value**: `http://notification-microservice:3010` ✅

### Optional Environment Variable

You can optionally set `NOTIFICATION_SERVICE_URL` in e-commerce `.env`:

```env
NOTIFICATION_SERVICE_URL=http://notification-microservice:3010
```

**Note**: This is optional since the default value matches the production setup.

---

## 📋 Integration Checklist

### 1. Deploy E-commerce Services

```bash
ssh statex
cd /path/to/e-commerce  # Find actual location
docker compose up -d
```

### 2. Verify Network Connectivity

Ensure e-commerce services are on `nginx-network`:

```bash
# Check if services are on network
docker network inspect nginx-network | grep e-commerce

# If not, connect them:
docker network connect nginx-network e-commerce-order-service
docker network connect nginx-network e-commerce-api-gateway
# ... repeat for all e-commerce services
```

**Or ensure `docker-compose.yml` includes**:
```yaml
networks:
  nginx-network:
    external: true
    name: nginx-network
```

### 3. Test Connectivity

From e-commerce order service:
```bash
docker exec e-commerce-order-service curl http://notification-microservice:3010/health
```

Expected response:
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2025-11-14T19:52:11.618Z",
  "service": "notification-microservice"
}
```

### 4. Test Notification Sending

Create a test order via e-commerce API and verify:
1. Order is created
2. Notification is sent to notification service
3. Check notification history:
   ```bash
   curl http://notification-microservice:3010/notifications/history
   ```

---

## 🔍 Verification Commands

### From Notification Microservice

```bash
cd /home/statex/notification-microservice
./scripts/verify-integration.sh
```

### From E-commerce Container

```bash
# Test health endpoint
docker exec e-commerce-order-service curl http://notification-microservice:3010/health

# Test notification sending (example)
docker exec e-commerce-order-service curl -X POST http://notification-microservice:3010/notifications/send \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "email",
    "type": "order_confirmation",
    "recipient": "test@example.com",
    "subject": "Order Confirmation",
    "message": "Your order has been confirmed"
  }'
```

---

## 📊 Integration Points

### Order Service Integration

**File**: `services/order-service/src/orders/orders.service.ts`

The order service automatically sends notifications when:
1. **Order Created**: `sendOrderConfirmationNotification()`
2. **Order Status Updated**: `sendOrderStatusUpdateNotification()`
3. **Payment Confirmed**: `sendPaymentConfirmationNotification()`

**Example**:
```typescript
// Automatically called after order creation
await this.notificationService.sendOrderConfirmation(
  recipientEmail,
  order.orderNumber,
  order.total,
  'email',
);
```

### Notification Types Used

- `order_confirmation` - When order is created
- `payment_confirmation` - When payment is confirmed
- `order_status_update` - When order status changes
- `shipment_tracking` - When shipment is tracked

---

## 🐛 Troubleshooting

### E-commerce Cannot Reach Notification Service

**Symptoms**:
- Order created but no notification sent
- Error logs show connection refused

**Solution**:
1. Verify both services are on `nginx-network`:
   ```bash
   docker network inspect nginx-network | grep -E 'e-commerce|notification'
   ```

2. Test DNS resolution:
   ```bash
   docker exec e-commerce-order-service nslookup notification-microservice
   ```

3. Test connectivity:
   ```bash
   docker exec e-commerce-order-service curl http://notification-microservice:3010/health
   ```

### Notifications Not Being Saved

**Symptoms**:
- Notification sent but not in history
- Database errors in logs

**Solution**:
1. Check database connection:
   ```bash
   docker exec notification-microservice psql -h db-server-postgres -U dbadmin -d notifications -c "SELECT COUNT(*) FROM notifications;"
   ```

2. Check notification service logs:
   ```bash
   docker compose logs notification-service | tail -50
   ```

### Notification Sending Fails

**Symptoms**:
- Notification status is "failed"
- Error in notification history

**Solution**:
1. Check notification status:
   ```bash
   curl http://notification-microservice:3010/notifications/status/<notification-id>
   ```

2. Check API keys in `.env`:
   ```bash
   cd /home/statex/notification-microservice
   cat .env | grep -E 'SENDGRID|TELEGRAM|WHATSAPP'
   ```

3. Update API keys if needed:
   ```bash
   nano .env
   docker compose restart notification-service
   ```

---

## 📝 API Keys Configuration

### Current Status

API keys in notification microservice `.env` are placeholders:
- `SENDGRID_API_KEY=your-sendgrid-api-key`
- `TELEGRAM_BOT_TOKEN=your-telegram-bot-token`
- `WHATSAPP_PHONE_NUMBER_ID=your-whatsapp-phone-number-id`
- `WHATSAPP_ACCESS_TOKEN=your-whatsapp-access-token`

### To Update API Keys

```bash
ssh statex
cd /home/statex/notification-microservice
nano .env
# Update API keys with real values
docker compose restart notification-service
```

**Note**: Notifications will be saved to database even if API keys are invalid, but sending will fail. Update API keys for production use.

---

## ✅ Success Criteria

- [x] Notification service running and healthy
- [x] E-commerce code configured (default URL set)
- [ ] E-commerce services deployed
- [ ] Network connectivity verified
- [ ] Test notification sent from e-commerce
- [ ] Order creation triggers notification
- [ ] Notification appears in history

---

## 📚 Related Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment guide
- [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md) - Current deployment status
- [README.md](../README.md) - API documentation

---

**Last Updated**: 2025-11-14

