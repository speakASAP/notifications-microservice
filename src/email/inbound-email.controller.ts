/**
 * Inbound Email Controller
 * Handles AWS SES SNS webhook for inbound emails
 */

import { Controller, Post, Get, Headers, HttpCode, HttpStatus, Req, Query } from '@nestjs/common';
import { Request } from 'express';
import { InboundEmailService, SNSMessage } from './inbound-email.service';
import { LoggerService } from '../../shared/logger/logger.service';
import { Inject } from '@nestjs/common';
import * as https from 'https';

@Controller('email')
export class InboundEmailController {
  constructor(
    private inboundEmailService: InboundEmailService,
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {}

  /**
   * Handle AWS SES SNS webhook for inbound emails
   * POST /email/inbound
   */
  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  async handleInbound(@Req() req: Request, @Headers() headers: any): Promise<{ status: string; message?: string }> {
    try {
      // Log immediately to confirm controller is called
      console.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST START =====`);
      console.log(`[CONTROLLER] req.body exists: ${!!req.body}, type: ${typeof req.body}`);
      
      this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST START =====`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] Request method: ${req.method}, URL: ${req.url}`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] Request headers: ${JSON.stringify(headers)}`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] Request body type: ${typeof req.body}, is string: ${typeof req.body === 'string'}`, 'InboundEmailController');
      
      // Get body directly from req.body to bypass ValidationPipe
      if (!req.body) {
        console.log(`[CONTROLLER] ERROR: req.body is null or undefined`);
        this.logger.error(`[CONTROLLER] req.body is null or undefined`, undefined, 'InboundEmailController');
        return { status: 'error', message: 'Request body is missing' };
      }
      
      const body: SNSMessage = req.body as SNSMessage;
      console.log(`[CONTROLLER] body extracted, Type: ${body?.Type}`);
      console.log(`[CONTROLLER] About to call this.logger.log...`);
      
      try {
        this.logger.log(`[CONTROLLER] Body extracted, Type: ${body?.Type}, MessageId: ${body?.MessageId}`, 'InboundEmailController');
        console.log(`[CONTROLLER] this.logger.log succeeded`);
      } catch (e) {
        console.error(`[CONTROLLER] ERROR in this.logger.log: ${e}`);
      }
      
      console.log(`[CONTROLLER] Body keys: ${Object.keys(body || {}).join(', ')}`);
      console.log(`[CONTROLLER] Body Type check: ${body?.Type === 'Notification' ? 'NOTIFICATION' : body?.Type === 'SubscriptionConfirmation' ? 'SUBSCRIPTION_CONFIRMATION' : 'UNKNOWN'}`);
      
      if (body?.Message) {
        console.log(`[CONTROLLER] Message field exists, length: ${body.Message.length}`);
        try {
          const messagePreview = JSON.parse(body.Message);
          console.log(`[CONTROLLER] Message preview - notificationType: ${messagePreview?.notificationType}, source: ${messagePreview?.mail?.source}`);
        } catch (e) {
          console.error(`[CONTROLLER] Failed to parse Message field: ${e}`);
        }
      }

      // Handle SNS subscription confirmation
      console.log(`[CONTROLLER] Checking body.Type: ${body.Type}`);
      if (body.Type === 'SubscriptionConfirmation') {
        this.logger.log(`[CONTROLLER] Processing SubscriptionConfirmation`, 'InboundEmailController');

        // Confirm subscription by visiting SubscribeURL
        if (body.SubscribeURL) {
          this.logger.log(`[CONTROLLER] SubscribeURL found: ${body.SubscribeURL.substring(0, 100)}...`, 'InboundEmailController');
          try {
            this.logger.log(`[CONTROLLER] Attempting to confirm subscription...`, 'InboundEmailController');
            await this.confirmSubscription(body.SubscribeURL);
            this.logger.log(`[CONTROLLER] ✅ SNS subscription confirmed successfully`, 'InboundEmailController');
            this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST END (SUCCESS) =====`, 'InboundEmailController');
            return { status: 'confirmed', message: 'Subscription confirmed' };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`[CONTROLLER] ❌ Failed to confirm SNS subscription: ${errorMessage}`, errorStack, 'InboundEmailController');
            this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST END (ERROR) =====`, 'InboundEmailController');
            return { status: 'error', message: `Failed to confirm subscription: ${errorMessage}` };
          }
        } else {
          this.logger.warn(`[CONTROLLER] ⚠️ SubscribeURL not provided in SubscriptionConfirmation`, 'InboundEmailController');
          this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST END (ERROR) =====`, 'InboundEmailController');
          return { status: 'error', message: 'SubscribeURL not provided' };
        }
      }

      // Handle SNS notification (actual email)
      if (body.Type === 'Notification') {
        console.log(`[CONTROLLER] Processing Notification type`);
        console.log(`[CONTROLLER] Calling inboundEmailService.handleSNSNotification...`);
        try {
          await this.inboundEmailService.handleSNSNotification(body);
          console.log(`[CONTROLLER] ✅ Successfully processed inbound email notification`);
          this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST END (SUCCESS) =====`, 'InboundEmailController');
          return { status: 'processed', message: 'Email notification processed' };
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorStack = error instanceof Error ? error.stack : undefined;
          console.error(`[CONTROLLER] ❌ Error in handleSNSNotification: ${errorMessage}`, errorStack);
          this.logger.error(`[CONTROLLER] ❌ Error in handleSNSNotification: ${errorMessage}`, errorStack, 'InboundEmailController');
          this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST END (ERROR) =====`, 'InboundEmailController');
          throw error;
        }
      }

      // Unknown message type
      this.logger.warn(`[CONTROLLER] ⚠️ Unknown SNS message type: ${body.Type}`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST END (IGNORED) =====`, 'InboundEmailController');
      return { status: 'ignored', message: `Unknown message type: ${body.Type}` };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[CONTROLLER] ❌❌❌ CRITICAL ERROR: ${errorMessage}`, errorStack);
      this.logger.error(`[CONTROLLER] ❌❌❌ CRITICAL ERROR in handleInbound: ${errorMessage}`, errorStack, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST END (CRITICAL ERROR) =====`, 'InboundEmailController');
      return { status: 'error', message: errorMessage };
    }
  }

  /**
   * Get list of inbound emails
   * GET /email/inbound?limit=100&toFilter=@speakasap.com&excludeTo=support@speakasap.com&status=processed
   */
  @Get('inbound')
  async getInboundEmails(
    @Query('limit') limit?: string,
    @Query('toFilter') toFilter?: string,
    @Query('excludeTo') excludeTo?: string | string[],
    @Query('status') status?: string,
  ): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 100;
      const excludeToList = Array.isArray(excludeTo) ? excludeTo : excludeTo ? [excludeTo] : [];
      const statusFilter = status || 'processed';

      const emails = await this.inboundEmailService.findInboundEmails({
        limit: limitNum,
        toFilter: toFilter || '@speakasap.com',
        excludeTo: excludeToList,
        status: statusFilter,
      });

      return {
        success: true,
        data: emails,
        count: emails.length,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting inbound emails: ${errorMessage}`, undefined, 'InboundEmailController');
      throw error;
    }
  }

  /**
   * Confirm SNS subscription by visiting SubscribeURL
   */
  private async confirmSubscription(subscribeUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      https.get(subscribeUrl, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Subscription confirmation failed with status code: ${res.statusCode}`));
        }
      }).on('error', (error) => {
        reject(error);
      });
    });
  }
}
