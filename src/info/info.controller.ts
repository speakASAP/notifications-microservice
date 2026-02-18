/**
 * Info Controller
 * Provides service information and API documentation endpoints
 */

import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/roles.decorator';

@Controller()
export class InfoController {
  @Public()
  @Get()
  getServiceInfo() {
    return {
      service: 'notifications-microservice',
      description: 'Multi-channel notification service for Email, Telegram, and WhatsApp',
      version: '1.0.0',
      status: 'operational',
      endpoints: {
        health: '/health',
        api: '/api/',
        sendNotification: 'POST /notifications/send',
        getHistory: 'GET /notifications/history',
        getStatus: 'GET /notifications/status/:id',
      },
      documentation: {
        healthCheck: 'GET /health - Check service health status',
        sendNotification: 'POST /notifications/send - Send notification via email, telegram, or whatsapp',
        getHistory: 'GET /notifications/history?limit=50&offset=0 - Get notification history',
        getStatus: 'GET /notifications/status/:id - Get notification status by ID',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('api')
  getApiInfo() {
    return {
      success: true,
      service: 'notifications-microservice',
      apiVersion: '1.0.0',
      endpoints: [
        {
          method: 'GET',
          path: '/health',
          description: 'Health check endpoint',
          response: {
            success: true,
            status: 'ok',
            timestamp: 'ISO 8601 string',
            service: 'notifications-microservice',
          },
        },
        {
          method: 'POST',
          path: '/notifications/send',
          description: 'Send a notification via email, telegram, or whatsapp',
          contentType: 'application/json',
          requestBody: {
            channel: 'email|telegram|whatsapp (required)',
            type: 'order_confirmation|payment_confirmation|order_status_update|shipment_tracking|custom (required)',
            recipient: 'string (required) - email address, phone number, or telegram chat ID',
            subject: 'string (optional) - notification subject',
            message: 'string (required) - notification message with {{template}} variables',
            templateData: 'object (optional) - template variable values',
            botToken: 'string (optional) - per-request telegram bot token',
            chatId: 'string (optional) - telegram chat ID alternative to recipient',
            parseMode: 'HTML|Markdown|MarkdownV2 (optional) - telegram message parse mode',
            inlineKeyboard: 'array (optional) - telegram inline keyboard buttons',
          },
          response: {
            success: true,
            data: {
              id: 'uuid',
              status: 'sent',
              channel: 'email|telegram|whatsapp',
              recipient: 'string',
              messageId: 'external-message-id',
            },
          },
        },
        {
          method: 'GET',
          path: '/notifications/history',
          description: 'Get notification history with optional pagination',
          queryParameters: {
            limit: 'number (optional) - Maximum number of notifications to return (default: 50)',
            offset: 'number (optional) - Number of notifications to skip (default: 0)',
          },
          response: {
            success: true,
            data: 'array of notification objects',
          },
        },
        {
          method: 'GET',
          path: '/notifications/status/:id',
          description: 'Get notification status by ID',
          pathParameters: {
            id: 'string (required) - notification UUID',
          },
          response: {
            success: true,
            data: {
              id: 'uuid',
              status: 'pending|sent|failed',
              channel: 'email|telegram|whatsapp',
              recipient: 'string',
              error: 'string|null',
              messageId: 'string|null',
              createdAt: 'ISO 8601 string',
              updatedAt: 'ISO 8601 string',
            },
          },
        },
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

