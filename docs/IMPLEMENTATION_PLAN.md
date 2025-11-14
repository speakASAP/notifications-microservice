# Notification Microservice Implementation Plan

**Date**: 2025-01-27  
**Status**: Planning  
**Objective**: Complete implementation of notification microservice for e-commerce platform

---

## Overview

This plan details the complete implementation of the notification microservice to make it production-ready and fully integrated with the e-commerce platform.

---

## Current State Analysis

### ✅ What Exists
- Basic NestJS structure
- Email, Telegram, WhatsApp services (basic implementation)
- Health controller
- Dockerfile and docker-compose.yml
- Database module (not integrated)
- Logger module (not integrated)
- API response utility

### ❌ What's Missing
- Database integration for notification history
- Logger integration
- Notification entity/model
- Complete notification history storage
- Error handling improvements
- .env.example file
- Deployment scripts
- Proper response formatting
- Template system
- Input validation improvements

---

## Implementation Tasks

### Phase 1: Database Integration

#### 1.1 Create Notification Entity
**File**: `src/notifications/entities/notification.entity.ts`
- Create TypeORM entity for notifications
- Fields: id, channel, type, recipient, subject, message, templateData, status, error, createdAt, updatedAt
- Add indexes for recipient, status, createdAt

#### 1.2 Update Database Module
**File**: `shared/database/database.module.ts`
- Ensure proper configuration
- Add entities array
- Export TypeOrmModule for feature modules

#### 1.3 Integrate Database into App Module
**File**: `src/app.module.ts`
- Import DatabaseModule
- Ensure proper initialization

#### 1.4 Update Notifications Module
**File**: `src/notifications/notifications.module.ts`
- Import TypeOrmModule.forFeature([Notification])
- Add NotificationRepository

---

### Phase 2: Logger Integration

#### 2.1 Integrate Logger into App Module
**File**: `src/app.module.ts`
- Import LoggerModule from shared/logger

#### 2.2 Update Services to Use Logger
**Files**:
- `src/notifications/notifications.service.ts`
- `src/email/email.service.ts`
- `src/telegram/telegram.service.ts`
- `src/whatsapp/whatsapp.service.ts`
- Inject LoggerService and add logging for all operations

---

### Phase 3: Complete Notification History

#### 3.1 Update Notifications Service
**File**: `src/notifications/notifications.service.ts`
- Implement `getHistory()` method with database query
- Implement `getStatus()` method with database lookup
- Update `send()` method to save notifications to database
- Add proper error handling and status tracking

#### 3.2 Add Notification Repository
**File**: `src/notifications/notifications.repository.ts` (if needed)
- Custom repository methods for complex queries

---

### Phase 4: Error Handling & Response Formatting

#### 4.1 Update Notifications Controller
**File**: `src/notifications/notifications.controller.ts`
- Use ApiResponseUtil for consistent responses
- Add proper error handling
- Add validation error responses

#### 4.2 Update Services Error Handling
**Files**:
- `src/email/email.service.ts`
- `src/telegram/telegram.service.ts`
- `src/whatsapp/whatsapp.service.ts`
- Improve error messages
- Save errors to database
- Return proper error responses

---

### Phase 5: Environment Configuration

#### 5.1 Create .env.example
**File**: `.env.example`
- Add all required environment variables
- Include descriptions
- No secret values

#### 5.2 Update docker-compose.yml
**File**: `docker-compose.yml`
- Add volumes for logs
- Ensure all env vars are passed
- Add healthcheck improvements if needed

---

### Phase 6: Deployment Scripts

#### 6.1 Create Deployment Script
**File**: `scripts/deploy.sh`
- Build Docker image
- Deploy to production
- Health check verification

#### 6.2 Create Status Script
**File**: `scripts/status.sh`
- Check service status
- Check health endpoint
- Display logs

#### 6.3 Create Start/Stop Scripts
**Files**:
- `scripts/start.sh`
- `scripts/stop.sh`
- `scripts/restart.sh`

---

### Phase 7: Template System (Optional Enhancement)

#### 7.1 Create Template Service
**File**: `src/templates/template.service.ts`
- Template rendering logic
- Support for template variables

#### 7.2 Update Email Service
**File**: `src/email/email.service.ts`
- Use template service for HTML emails

---

### Phase 8: Documentation Updates

#### 8.1 Update README.md
**File**: `README.md`
- Add deployment instructions
- Add environment variables documentation
- Add API documentation
- Add integration examples

#### 8.2 Create DEPLOYMENT.md
**File**: `docs/DEPLOYMENT.md`
- Production deployment guide
- Environment setup
- Troubleshooting

---

### Phase 9: Testing & Verification

#### 9.1 Test Email Service
- Test with valid SendGrid credentials
- Test error handling

#### 9.2 Test Telegram Service
- Test with valid bot token
- Test error handling

#### 9.3 Test WhatsApp Service
- Test with valid credentials
- Test error handling

#### 9.4 Test Database Integration
- Test notification storage
- Test history retrieval
- Test status lookup

#### 9.5 Test E-commerce Integration
- Verify e-commerce can call notification service
- Test all notification types
- Verify response format

---

## File Structure After Implementation

```
notification-microservice/
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── package.json
├── README.md
├── tsconfig.json
├── nest-cli.json
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   └── DEPLOYMENT.md
├── scripts/
│   ├── deploy.sh
│   ├── status.sh
│   ├── start.sh
│   ├── stop.sh
│   └── restart.sh
├── shared/
│   ├── database/
│   │   └── database.module.ts
│   ├── logger/
│   │   ├── logger.module.ts
│   │   └── logger.service.ts
│   └── utils/
│       └── api-response.util.ts
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── health/
│   │   └── health.controller.ts
│   ├── notifications/
│   │   ├── dto/
│   │   │   └── send-notification.dto.ts
│   │   ├── entities/
│   │   │   └── notification.entity.ts
│   │   ├── notifications.controller.ts
│   │   ├── notifications.module.ts
│   │   └── notifications.service.ts
│   ├── email/
│   │   └── email.service.ts
│   ├── telegram/
│   │   └── telegram.service.ts
│   ├── whatsapp/
│   │   └── whatsapp.service.ts
│   └── templates/
│       └── (template files if needed)
└── logs/
```

---

## Environment Variables Required

```env
# Service Configuration
PORT=3010
NODE_ENV=production
CORS_ORIGIN=*

# Database Configuration
DB_HOST=db-server-postgres
DB_PORT=5432
DB_USER=dbadmin
DB_PASSWORD=
DB_NAME=notifications
DB_SYNC=false

# SendGrid Configuration
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@flipflop.cz
SENDGRID_FROM_NAME=FlipFlop.cz

# Telegram Configuration
TELEGRAM_BOT_TOKEN=

# WhatsApp Configuration
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_API_URL=https://graph.facebook.com/v18.0

# Logging Configuration
LOG_LEVEL=info
```

---

## Database Schema

### notifications table
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(20) NOT NULL,
  type VARCHAR(50) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  message TEXT NOT NULL,
  template_data JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
```

---

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "sent",
    "channel": "email",
    "recipient": "user@example.com",
    "messageId": "external-id"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid recipient email",
    "details": {}
  }
}
```

---

## Integration Points

### E-commerce Platform
- Service URL: `http://notification-microservice:3010`
- Endpoint: `POST /notifications/send`
- Expected response format: `{ success: boolean, data: {...} }`

### Database Server
- Host: `db-server-postgres`
- Port: `5432`
- Database: `notifications`
- Network: `nginx-network`

### Logging Service (Future)
- Can integrate with logging-microservice for centralized logging

---

## Success Criteria

1. ✅ All notification channels working (Email, Telegram, WhatsApp)
2. ✅ Notifications stored in database
3. ✅ Notification history retrievable
4. ✅ Status tracking working
5. ✅ Proper error handling and logging
6. ✅ E-commerce integration working
7. ✅ Production deployment successful
8. ✅ Health checks passing
9. ✅ Documentation complete

---

## Implementation Checklist

### Phase 1: Database Integration
- [ ] Create notification.entity.ts
- [ ] Update database.module.ts
- [ ] Integrate database into app.module.ts
- [ ] Update notifications.module.ts

### Phase 2: Logger Integration
- [ ] Integrate logger into app.module.ts
- [ ] Add logging to notifications.service.ts
- [ ] Add logging to email.service.ts
- [ ] Add logging to telegram.service.ts
- [ ] Add logging to whatsapp.service.ts

### Phase 3: Complete Notification History
- [ ] Implement getHistory() method
- [ ] Implement getStatus() method
- [ ] Update send() to save to database
- [ ] Add status tracking

### Phase 4: Error Handling
- [ ] Update notifications.controller.ts
- [ ] Improve error handling in services
- [ ] Add validation error responses

### Phase 5: Environment Configuration
- [ ] Create .env.example
- [ ] Update docker-compose.yml

### Phase 6: Deployment Scripts
- [ ] Create deploy.sh
- [ ] Create status.sh
- [ ] Create start.sh
- [ ] Create stop.sh
- [ ] Create restart.sh

### Phase 7: Template System (Optional)
- [ ] Create template.service.ts
- [ ] Update email service

### Phase 8: Documentation
- [ ] Update README.md
- [ ] Create DEPLOYMENT.md

### Phase 9: Testing
- [ ] Test all services
- [ ] Test database integration
- [ ] Test e-commerce integration
- [ ] Verify production deployment

---

**End of Plan**

