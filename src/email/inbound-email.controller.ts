/**
 * Inbound Email Controller
 * Handles AWS SES SNS webhook for inbound emails
 */

import { Controller, Post, Get, Headers, HttpCode, HttpStatus, Req, Query, Param } from '@nestjs/common';
import { Request } from 'express';
import { InboundEmailService, InboundEmailSummary, SNSMessage } from './inbound-email.service';
import { LoggerService } from '../../shared/logger/logger.service';
import { Inject } from '@nestjs/common';
import * as https from 'https';

/** Body shape for POST /email/inbound/s3 (SNS SubscriptionConfirmation, S3 event, or manual { bucket, key }) */
interface S3EndpointBody {
  Type?: string;
  SubscribeURL?: string;
  Records?: Array<{ s3?: { bucket?: { name: string }; object?: { key: string } } }>;
  bucket?: string;
  key?: string;
}

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
  async handleInbound(
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ status: string; message?: string }> {
    try {
      // Log immediately to confirm controller is called
      this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST START =====`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] Request method: ${req.method}, URL: ${req.url}`, 'InboundEmailController');
      const safeHeaders = this.getSafeHeadersForLogging(headers);
      this.logger.log(`[CONTROLLER] Request headers (safe): ${JSON.stringify(safeHeaders)}`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] Request body type: ${typeof req.body}, is string: ${typeof req.body === 'string'}`, 'InboundEmailController');

      // Get body directly from req.body to bypass ValidationPipe
      if (!req.body) {
        this.logger.error(`[CONTROLLER] req.body is null or undefined`, undefined, 'InboundEmailController');
        return { status: 'error', message: 'Request body is missing' };
      }

      const body: SNSMessage = req.body as SNSMessage;
      this.logger.log(`[CONTROLLER] Body extracted, Type: ${body?.Type}, MessageId: ${body?.MessageId}`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] Body keys: ${Object.keys(body || {}).join(', ')}, Type: ${body?.Type === 'Notification' ? 'NOTIFICATION' : body?.Type === 'SubscriptionConfirmation' ? 'SUBSCRIPTION_CONFIRMATION' : 'UNKNOWN'}`, 'InboundEmailController');

      if (body?.Message) {
        this.logger.log(`[CONTROLLER] Message field exists, length: ${body.Message.length}`, 'InboundEmailController');
        try {
          const messagePreview = JSON.parse(body.Message);
          this.logger.log(`[CONTROLLER] Message preview - notificationType: ${messagePreview?.notificationType}, source: ${messagePreview?.mail?.source}`, 'InboundEmailController');
        } catch (e) {
          this.logger.error(`[CONTROLLER] Failed to parse Message field: ${e}`, undefined, 'InboundEmailController');
        }
      }

      // Handle SNS subscription confirmation
      this.logger.log(`[CONTROLLER] Checking body.Type: ${body.Type}`, 'InboundEmailController');
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
        this.logger.log(`[CONTROLLER] Processing Notification type, calling handleSNSNotification`, 'InboundEmailController');
        try {
          await this.inboundEmailService.handleSNSNotification(body);
          this.logger.log(`[CONTROLLER] ✅ Successfully processed inbound email notification`, 'InboundEmailController');
          this.logger.log(`[CONTROLLER] ===== INBOUND EMAIL WEBHOOK REQUEST END (SUCCESS) =====`, 'InboundEmailController');
          return { status: 'processed', message: 'Email notification processed' };
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorStack = error instanceof Error ? error.stack : undefined;
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
  ): Promise<{ success: boolean; data: InboundEmailSummary[]; count: number }> {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 100;
      const safeLimit =
        Number.isNaN(limitNum) || limitNum < 1 ? 100 : Math.min(limitNum, 500);
      const excludeToList = Array.isArray(excludeTo) ? excludeTo : excludeTo ? [excludeTo] : [];
      const statusFilter = status || 'processed';

      const emails = await this.inboundEmailService.findInboundEmails({
        limit: safeLimit,
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
   * Re-parse an email from rawData and update attachments
   * POST /email/inbound/:id/reparse
   */
  @Post('inbound/:id/reparse')
  async reparseEmail(@Param('id') id: string): Promise<{ success: boolean; message: string; attachments?: number }> {
    try {
      this.logger.log(`[CONTROLLER] Re-parsing email: ${id}`, 'InboundEmailController');
      const result = await this.inboundEmailService.reparseEmailFromRawData(id);
      return {
        success: true,
        message: 'Email re-parsed successfully',
        attachments: result.attachmentsCount,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error re-parsing email: ${errorMessage}`, undefined, 'InboundEmailController');
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Process email from S3 bucket (for S3 event notifications or manual processing)
   * POST /email/inbound/s3
   * Body: { bucket: string, key: string }
   */
  @Post('inbound/s3')
  async processFromS3(@Req() req: Request): Promise<{ success: boolean; message: string; id?: string; attachments?: number }> {
    try {
      this.logger.log(`[CONTROLLER] Processing request to /email/inbound/s3`, 'InboundEmailController');

      // Handle SNS subscription confirmation (for S3 event notifications)
      const body = req.body as S3EndpointBody | undefined;
      if (body && body.Type === 'SubscriptionConfirmation') {
        this.logger.log(`[CONTROLLER] Processing SubscriptionConfirmation for S3 events`, 'InboundEmailController');
        if (body.SubscribeURL) {
          this.logger.log(`[CONTROLLER] SubscribeURL found: ${body.SubscribeURL.substring(0, 100)}...`, 'InboundEmailController');
          try {
            this.logger.log(`[CONTROLLER] Attempting to confirm S3 events subscription...`, 'InboundEmailController');
            await this.confirmSubscription(body.SubscribeURL);
            this.logger.log(`[CONTROLLER] ✅ SNS subscription for S3 events confirmed successfully`, 'InboundEmailController');
            return { success: true, message: 'S3 events subscription confirmed' };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`[CONTROLLER] ❌ Failed to confirm S3 events subscription: ${errorMessage}`, errorStack, 'InboundEmailController');
            return { success: false, message: `Failed to confirm subscription: ${errorMessage}` };
          }
        } else {
          this.logger.warn(`[CONTROLLER] ⚠️ SubscribeURL not provided in SubscriptionConfirmation`, 'InboundEmailController');
          return { success: false, message: 'SubscribeURL not provided' };
        }
      }

      // Handle S3 event notification format (from SNS)
      if (req.body && req.body.Records && Array.isArray(req.body.Records)) {
        // S3 event notification via SNS
        const records = req.body.Records;
        this.logger.log(`[CONTROLLER] Received S3 event notification with ${records.length} record(s)`, 'InboundEmailController');

        const results = [];
        for (const record of records) {
          if (record.s3 && record.s3.bucket && record.s3.object) {
            const bucketName = record.s3.bucket.name;
            const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
            this.logger.log(`[CONTROLLER] Processing S3 event: bucket=${bucketName}, key=${objectKey}`, 'InboundEmailController');

            try {
              const result = await this.inboundEmailService.processEmailFromS3(bucketName, objectKey);
              results.push({ success: true, id: result.id, attachments: result.attachmentsCount });
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              this.logger.error(`[CONTROLLER] Failed to process S3 email: ${errorMessage}`, undefined, 'InboundEmailController');
              results.push({ success: false, message: errorMessage });
            }
          }
        }

        return {
          success: results.every((r) => r.success),
          message: `Processed ${results.filter((r) => r.success).length} of ${results.length} email(s)`,
          id: results.find((r) => r.id)?.id,
          attachments: results.find((r) => r.attachments !== undefined)?.attachments,
        };
      }

      // Handle manual processing format
      const { bucket, key } = req.body;
      if (!bucket || !key) {
        return {
          success: false,
          message: 'Missing required parameters: bucket and key',
        };
      }

      this.logger.log(`[CONTROLLER] Manual S3 processing: bucket=${bucket}, key=${key}`, 'InboundEmailController');
      const result = await this.inboundEmailService.processEmailFromS3(bucket, key);
      return {
        success: true,
        message: 'Email processed successfully from S3',
        id: result.id,
        attachments: result.attachmentsCount,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[CONTROLLER] Error processing email from S3: ${errorMessage}`, undefined, 'InboundEmailController');
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Return only allowlisted headers for logging (avoid Authorization, Cookie, etc.)
   */
  private getSafeHeadersForLogging(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, string | string[] | undefined> {
    const allowlist = ['content-type', 'x-request-id'];
    const out: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (v === undefined) continue;
      const lower = k.toLowerCase();
      if (allowlist.includes(lower)) out[lower] = v;
    }
    return out;
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
