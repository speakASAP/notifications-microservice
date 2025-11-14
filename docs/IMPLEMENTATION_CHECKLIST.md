# Notification Microservice Implementation Checklist

This is the sequential, atomic action checklist for implementing the notification microservice.

## IMPLEMENTATION CHECKLIST

1. Create notification entity file `src/notifications/entities/notification.entity.ts` with TypeORM entity definition
2. Add id field (UUID, primary key, auto-generated) to notification entity
3. Add channel field (string, enum: email, telegram, whatsapp) to notification entity
4. Add type field (string, enum: order_confirmation, payment_confirmation, order_status_update, shipment_tracking, custom) to notification entity
5. Add recipient field (string, 255 chars) to notification entity
6. Add subject field (string, 500 chars, optional) to notification entity
7. Add message field (text) to notification entity
8. Add templateData field (JSONB, optional) to notification entity
9. Add status field (string, enum: pending, sent, failed, default: pending) to notification entity
10. Add error field (text, optional) to notification entity
11. Add createdAt field (timestamp, auto) to notification entity
12. Add updatedAt field (timestamp, auto) to notification entity
13. Add indexes for recipient, status, and createdAt in notification entity
14. Update `shared/database/database.module.ts` to include entities array with Notification entity
15. Update `shared/database/database.module.ts` to export TypeOrmModule for feature modules
16. Import DatabaseModule in `src/app.module.ts`
17. Import LoggerModule in `src/app.module.ts`
18. Update `src/notifications/notifications.module.ts` to import TypeOrmModule.forFeature([Notification])
19. Inject NotificationRepository in `src/notifications/notifications.service.ts` constructor
20. Update `send()` method in `src/notifications/notifications.service.ts` to create notification record with status 'pending' before sending
21. Update `send()` method in `src/notifications/notifications.service.ts` to update notification record with status 'sent' and messageId on success
22. Update `send()` method in `src/notifications/notifications.service.ts` to update notification record with status 'failed' and error message on failure
23. Implement `getHistory()` method in `src/notifications/notifications.service.ts` to query database with limit and offset
24. Implement `getStatus()` method in `src/notifications/notifications.service.ts` to find notification by id
25. Inject LoggerService in `src/notifications/notifications.service.ts` constructor
26. Add log statement in `send()` method before sending notification
27. Add log statement in `send()` method on success
28. Add error log statement in `send()` method on failure
29. Inject LoggerService in `src/email/email.service.ts` constructor
30. Add log statement in `send()` method of email service before API call
31. Add log statement in `send()` method of email service on success
32. Add error log statement in `send()` method of email service on failure
33. Inject LoggerService in `src/telegram/telegram.service.ts` constructor
34. Add log statement in `send()` method of telegram service before API call
35. Add log statement in `send()` method of telegram service on success
36. Add error log statement in `send()` method of telegram service on failure
37. Inject LoggerService in `src/whatsapp/whatsapp.service.ts` constructor
38. Add log statement in `send()` method of whatsapp service before API call
39. Add log statement in `send()` method of whatsapp service on success
40. Add error log statement in `send()` method of whatsapp service on failure
41. Update `src/notifications/notifications.controller.ts` to use ApiResponseUtil.success() for success responses
42. Update `src/notifications/notifications.controller.ts` to use ApiResponseUtil.error() for error responses
43. Add try-catch block in `sendNotification()` method of controller
44. Add try-catch block in `getHistory()` method of controller
45. Add try-catch block in `getStatus()` method of controller
46. Update `src/email/email.service.ts` to save error details to notification record on failure
47. Update `src/telegram/telegram.service.ts` to save error details to notification record on failure
48. Update `src/whatsapp/whatsapp.service.ts` to save error details to notification record on failure
49. Create `.env.example` file in root directory
50. Add PORT=3010 to .env.example
51. Add NODE_ENV=production to .env.example
52. Add CORS_ORIGIN=* to .env.example
53. Add DB_HOST=db-server-postgres to .env.example
54. Add DB_PORT=5432 to .env.example
55. Add DB_USER=dbadmin to .env.example
56. Add DB_PASSWORD= to .env.example (empty, no value)
57. Add DB_NAME=notifications to .env.example
58. Add DB_SYNC=false to .env.example
59. Add SENDGRID_API_KEY= to .env.example (empty, no value)
60. Add SENDGRID_FROM_EMAIL=noreply@flipflop.cz to .env.example
61. Add SENDGRID_FROM_NAME=FlipFlop.cz to .env.example
62. Add TELEGRAM_BOT_TOKEN= to .env.example (empty, no value)
63. Add WHATSAPP_PHONE_NUMBER_ID= to .env.example (empty, no value)
64. Add WHATSAPP_ACCESS_TOKEN= to .env.example (empty, no value)
65. Add WHATSAPP_API_URL=https://graph.facebook.com/v18.0 to .env.example
66. Add LOG_LEVEL=info to .env.example
67. Update `docker-compose.yml` to add volumes for logs directory
68. Create `scripts/` directory
69. Create `scripts/deploy.sh` script with Docker build and deploy commands
70. Add shebang and error handling to deploy.sh
71. Add health check verification to deploy.sh
72. Create `scripts/status.sh` script to check service status
73. Add health endpoint check to status.sh
74. Add log display to status.sh
75. Create `scripts/start.sh` script to start service
76. Create `scripts/stop.sh` script to stop service
77. Create `scripts/restart.sh` script to restart service
78. Make all scripts executable (chmod +x)
79. Update `README.md` with deployment instructions
80. Update `README.md` with environment variables documentation
81. Update `README.md` with API documentation
82. Update `README.md` with integration examples
83. Create `docs/DEPLOYMENT.md` file
84. Add production deployment guide to DEPLOYMENT.md
85. Add environment setup instructions to DEPLOYMENT.md
86. Add troubleshooting section to DEPLOYMENT.md
87. Update `src/notifications/dto/send-notification.dto.ts` to ensure subject is optional for non-email channels
88. Add validation decorators to ensure required fields are present
89. Test email service with mock data
90. Test telegram service with mock data
91. Test whatsapp service with mock data
92. Test database save operation
93. Test notification history retrieval
94. Test notification status lookup
95. Verify e-commerce can connect to notification service
96. Verify response format matches e-commerce expectations
97. Test all notification types from e-commerce
98. Verify production deployment on server
99. Verify health checks pass
100. Final documentation review

---

**Total Tasks: 100**

