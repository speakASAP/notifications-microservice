/**
 * Inbound Email Controller
 * Handles AWS SES SNS webhook for inbound emails
 */

import { Controller, Post, Headers, HttpCode, HttpStatus, Req } from '@nestjs/common';
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
    // Get body directly from req.body to bypass ValidationPipe
    const body: SNSMessage = req.body as SNSMessage;
    
    this.logger.log(`Received inbound email webhook request`, 'InboundEmailController');
    this.logger.log(`Request method: ${req.method}, URL: ${req.url}`, 'InboundEmailController');
    this.logger.log(`Request headers: ${JSON.stringify(headers)}`, 'InboundEmailController');
    this.logger.log(`Request body (raw): ${JSON.stringify(req.body)}`, 'InboundEmailController');
    this.logger.log(`Request body type: ${body?.Type}, SubscribeURL: ${body?.SubscribeURL?.substring(0, 100)}...`, 'InboundEmailController');

    try {
      // Handle SNS subscription confirmation
      if (body.Type === 'SubscriptionConfirmation') {
        this.logger.log('SNS subscription confirmation received', 'InboundEmailController');

        // Confirm subscription by visiting SubscribeURL
        if (body.SubscribeURL) {
          try {
            await this.confirmSubscription(body.SubscribeURL);
            this.logger.log('SNS subscription confirmed successfully', 'InboundEmailController');
            return { status: 'confirmed', message: 'Subscription confirmed' };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to confirm SNS subscription: ${errorMessage}`, undefined, 'InboundEmailController');
            return { status: 'error', message: `Failed to confirm subscription: ${errorMessage}` };
          }
        } else {
          this.logger.warn('SNS subscription confirmation received but no SubscribeURL provided', 'InboundEmailController');
          return { status: 'error', message: 'SubscribeURL not provided' };
        }
      }

      // Handle SNS notification (actual email)
      if (body.Type === 'Notification') {
        this.logger.log('SNS notification received, processing inbound email', 'InboundEmailController');
        await this.inboundEmailService.handleSNSNotification(body);
        return { status: 'processed', message: 'Email notification processed' };
      }

      // Unknown message type
      this.logger.warn(`Unknown SNS message type: ${body.Type}`, 'InboundEmailController');
      return { status: 'ignored', message: `Unknown message type: ${body.Type}` };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to handle inbound email webhook: ${errorMessage}`, errorStack, 'InboundEmailController');
      return { status: 'error', message: errorMessage };
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
