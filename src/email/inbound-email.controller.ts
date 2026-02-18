/**
 * Inbound Email Controller
 * Handles S3 event notifications for inbound emails (S3-only mode).
 * POST /email/inbound is legacy endpoint (returns 200 OK, no processing).
 */

import { Controller, Post, Get, Headers, HttpCode, HttpStatus, Req, Query, Param, Body } from '@nestjs/common';
import { Request } from 'express';
import { InboundEmailService, InboundEmailSummary } from './inbound-email.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
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

/** Body for POST /email/inbound/delivery-confirmation (helpdesk callback). subscriptionId optional when status=delivered (e.g. email received via poll). */
interface DeliveryConfirmationBody {
  inboundEmailId: string;
  subscriptionId?: string | null;
  status: 'delivered' | 'failed';
  ticketId?: string | null;
  commentId?: string | null;
  error?: string | null;
}

@Controller('email')
export class InboundEmailController {
  constructor(
    private inboundEmailService: InboundEmailService,
    private webhookDeliveryService: WebhookDeliveryService,
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {}

  /**
   * Legacy endpoint: SES notifications are no longer processed (S3-only mode).
   * Returns 200 OK to prevent SNS retries, but does not process emails.
   * POST /email/inbound
   */
  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  async handleInbound(
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ status: string; message?: string }> {
    // S3-only mode: SES notifications are not processed
    // Return 200 OK to prevent SNS retries and extra billing
    this.logger.log(
      `[CONTROLLER] POST /email/inbound received but ignored (S3-only mode: only /email/inbound/s3 processes emails)`,
      'InboundEmailController',
    );
    return { status: 'ignored', message: 'S3-only mode: SES notifications not processed. Use /email/inbound/s3 for S3 events.' };
  }

  /**
   * List S3 objects not yet in DB (unprocessed emails). Uses service S3 client (no AWS CLI on host needed).
   * GET /email/inbound/s3-unprocessed?maxKeys=500
   */
  @Get('inbound/s3-unprocessed')
  async getS3Unprocessed(
    @Query('maxKeys') maxKeys?: string,
  ): Promise<{ success: boolean; data: { s3Count: number; processedCount: number; unprocessed: Array<{ key: string; size: number; lastModified: string }>; bucket: string; prefix: string } }> {
    try {
      const max = maxKeys ? Math.min(parseInt(maxKeys, 10) || 500, 1000) : 500;
      const data = await this.inboundEmailService.findUnprocessedS3Keys({ maxKeys: max });
      return { success: true, data };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error listing S3 unprocessed: ${errorMessage}`, undefined, 'InboundEmailController');
      throw error;
    }
  }

  /**
   * Get list of inbound emails
   * GET /email/inbound?limit=100&toFilter=@speakasap.com&excludeTo=support@speakasap.com&status=processed
   * GET /email/inbound?listOnly=1&limit=10 - lightweight list (id, from, to, subject, receivedAt, messageId, status only) for poll; fetch full by GET /email/inbound/:id
   */
  @Get('inbound')
  async getInboundEmails(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('toFilter') toFilter?: string,
    @Query('excludeTo') excludeTo?: string | string[],
    @Query('status') status?: string,
    @Query('listOnly') listOnly?: string,
  ): Promise<{ success: boolean; data: InboundEmailSummary[]; count: number }> {
    const t0 = Date.now();
    const listOnlyMode = listOnly === '1' || listOnly === 'true';
    this.logger.log(`[CONTROLLER] ===== GET /email/inbound START (listOnly=${listOnlyMode}) =====`, 'InboundEmailController');
    this.logger.log(`[CONTROLLER] Query params: limit=${limit}, offset=${offset}, toFilter=${toFilter}, excludeTo=${excludeTo}, status=${status}, listOnly=${listOnly}`, 'InboundEmailController');
    try {
      const limitNum = limit ? parseInt(limit, 10) : 100;
      const safeLimit =
        Number.isNaN(limitNum) || limitNum < 1 ? 100 : Math.min(limitNum, 500);
      const offsetNum = offset ? parseInt(offset, 10) : 0;
      const safeOffset = Number.isNaN(offsetNum) || offsetNum < 0 ? 0 : offsetNum;
      const excludeToList = Array.isArray(excludeTo) ? excludeTo : excludeTo ? [excludeTo] : [];
      const statusFilter = status || 'processed';

      const emails = await this.inboundEmailService.findInboundEmails({
        limit: safeLimit,
        offset: safeOffset,
        toFilter: toFilter || '@speakasap.com',
        excludeTo: excludeToList,
        status: statusFilter,
        listOnly: listOnlyMode,
      });

      const elapsed = Date.now() - t0;
      this.logger.log(`[CONTROLLER] ✅ Found ${emails.length} emails in ${elapsed}ms`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] ===== GET /email/inbound END (SUCCESS) totalMs=${elapsed} =====`, 'InboundEmailController');
      return {
        success: true,
        data: emails,
        count: emails.length,
      };
    } catch (error: unknown) {
      const elapsed = Date.now() - t0;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[CONTROLLER] ❌ Error getting inbound emails: ${errorMessage} (after ${elapsed}ms)`, undefined, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] ===== GET /email/inbound END (ERROR) totalMs=${elapsed} =====`, 'InboundEmailController');
      throw error;
    }
  }

  /**
   * Confirm delivery from helpdesk (or other subscriber) after ticket/comment was created.
   * POST /email/inbound/delivery-confirmation
   * Body: { inboundEmailId, subscriptionId, status: 'delivered'|'failed', ticketId?, commentId?, error? }
   */
  @Post('inbound/delivery-confirmation')
  @HttpCode(HttpStatus.OK)
  async deliveryConfirmation(
    @Body() body: DeliveryConfirmationBody,
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!body?.inboundEmailId || !body?.status) {
        this.logger.warn(`[CONTROLLER] delivery-confirmation missing required fields`, 'InboundEmailController');
        return { success: false, message: 'Missing inboundEmailId or status' };
      }
      if (body.status !== 'delivered' && body.status !== 'failed') {
        return { success: false, message: "status must be 'delivered' or 'failed'" };
      }
      if (body.subscriptionId) {
        const result = await this.webhookDeliveryService.confirmDelivery({
          inboundEmailId: body.inboundEmailId,
          subscriptionId: body.subscriptionId,
          status: body.status,
          ticketId: body.ticketId ?? null,
          commentId: body.commentId ?? null,
          error: body.error ?? null,
        });
        return result;
      }
      if (body.status === 'delivered') {
        return await this.webhookDeliveryService.confirmDeliveryByInboundEmailIdOnly({
          inboundEmailId: body.inboundEmailId,
          status: 'delivered',
          ticketId: body.ticketId ?? null,
          commentId: body.commentId ?? null,
        });
      }
      return { success: false, message: 'subscriptionId required when status is failed' };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in delivery-confirmation: ${errorMessage}`, undefined, 'InboundEmailController');
      return { success: false, message: errorMessage };
    }
  }

  /**
   * List webhook deliveries sent to helpdesk but not yet confirmed (status=sent).
   * GET /email/inbound/undelivered?limit=100
   */
  @Get('inbound/undelivered')
  async getUndelivered(
    @Query('limit') limit?: string,
  ): Promise<{ success: boolean; data: { inboundEmailId: string; subscriptionId: string; createdAt: string }[] }> {
    try {
      const limitNum = limit ? Math.min(parseInt(limit, 10) || 100, 500) : 100;
      const data = await this.webhookDeliveryService.getUndeliveredToHelpdesk(limitNum);
      return { success: true, data };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting undelivered: ${errorMessage}`, undefined, 'InboundEmailController');
      throw error;
    }
  }

  /**
   * Get one inbound email by ID (full body and attachments).
   * Used by helpdesk poll flow: list with listOnly=1, then fetch full email by ID for each item to create ticket.
   * GET /email/inbound/:id (must be after static routes like inbound/undelivered)
   */
  @Get('inbound/:id')
  async getInboundEmailById(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: InboundEmailSummary | null }> {
    const email = await this.inboundEmailService.getInboundEmailById(id);
    return { success: true, data: email };
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
  async processFromS3(
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ success: boolean; message: string; id?: string; attachments?: number }> {
    try {
      // Log immediately to confirm controller is called
      this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST START =====`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] Request method: ${req.method}, URL: ${req.url}`, 'InboundEmailController');
      const safeHeaders = this.getSafeHeadersForLogging(headers);
      this.logger.log(`[CONTROLLER] Request headers (safe): ${JSON.stringify(safeHeaders)}`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] Request body type: ${typeof req.body}, is string: ${typeof req.body === 'string'}`, 'InboundEmailController');

      // Get body directly from req.body
      if (!req.body) {
        this.logger.error(`[CONTROLLER] req.body is null or undefined`, undefined, 'InboundEmailController');
        this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST END (ERROR) =====`, 'InboundEmailController');
        return { success: false, message: 'Request body is missing' };
      }

      const body = req.body as S3EndpointBody | undefined;
      this.logger.log(`[CONTROLLER] Body extracted, Type: ${body?.Type}, has Records: ${!!body?.Records}, has bucket: ${!!body?.bucket}, has key: ${!!body?.key}`, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] Body keys: ${Object.keys(body || {}).join(', ')}`, 'InboundEmailController');

      // Handle SNS subscription confirmation (for S3 event notifications)
      if (body && body.Type === 'SubscriptionConfirmation') {
        this.logger.log(`[CONTROLLER] Processing SubscriptionConfirmation for S3 events`, 'InboundEmailController');
        if (body.SubscribeURL) {
          this.logger.log(`[CONTROLLER] SubscribeURL found: ${body.SubscribeURL.substring(0, 100)}...`, 'InboundEmailController');
          try {
            this.logger.log(`[CONTROLLER] Attempting to confirm S3 events subscription...`, 'InboundEmailController');
            await this.confirmSubscription(body.SubscribeURL);
            this.logger.log(`[CONTROLLER] ✅ SNS subscription for S3 events confirmed successfully`, 'InboundEmailController');
            this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST END (SUCCESS - SUBSCRIPTION CONFIRMED) =====`, 'InboundEmailController');
            return { success: true, message: 'S3 events subscription confirmed' };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`[CONTROLLER] ❌ Failed to confirm S3 events subscription: ${errorMessage}`, errorStack, 'InboundEmailController');
            this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST END (ERROR - SUBSCRIPTION FAILED) =====`, 'InboundEmailController');
            return { success: false, message: `Failed to confirm subscription: ${errorMessage}` };
          }
        } else {
          this.logger.warn(`[CONTROLLER] ⚠️ SubscribeURL not provided in SubscriptionConfirmation`, 'InboundEmailController');
          this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST END (ERROR - NO SUBSCRIBE URL) =====`, 'InboundEmailController');
          return { success: false, message: 'SubscribeURL not provided' };
        }
      }

      // Handle S3 event notification format (from SNS)
      if (req.body && req.body.Records && Array.isArray(req.body.Records)) {
        // S3 event notification via SNS
        const records = req.body.Records;
        this.logger.log(`[CONTROLLER] Received S3 event notification with ${records.length} record(s)`, 'InboundEmailController');
        this.logger.log(`[CONTROLLER] Processing S3 event notification format (from SNS)`, 'InboundEmailController');

        const results = [];
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          this.logger.log(`[CONTROLLER] Processing record ${i + 1}/${records.length}`, 'InboundEmailController');
          if (record.s3 && record.s3.bucket && record.s3.object) {
            const bucketName = record.s3.bucket.name;
            const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
            this.logger.log(`[CONTROLLER] S3 event details: bucket=${bucketName}, key=${objectKey}`, 'InboundEmailController');

            try {
              this.logger.log(`[CONTROLLER] Calling processEmailFromS3 for bucket=${bucketName}, key=${objectKey}`, 'InboundEmailController');
              const result = await this.inboundEmailService.processEmailFromS3(bucketName, objectKey);
              this.logger.log(`[CONTROLLER] ✅ Successfully processed S3 email: id=${result.id}, attachments=${result.attachmentsCount}`, 'InboundEmailController');
              results.push({ success: true, id: result.id, attachments: result.attachmentsCount });
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              const errorStack = error instanceof Error ? error.stack : undefined;
              this.logger.error(`[CONTROLLER] ❌ Failed to process S3 email from bucket=${bucketName}, key=${objectKey}: ${errorMessage}`, errorStack, 'InboundEmailController');
              results.push({ success: false, message: errorMessage });
            }
          } else {
            this.logger.warn(`[CONTROLLER] ⚠️ Record ${i + 1} missing s3.bucket or s3.object`, 'InboundEmailController');
            results.push({ success: false, message: 'Invalid record format: missing s3.bucket or s3.object' });
          }
        }

        const successCount = results.filter((r) => r.success).length;
        const totalCount = results.length;
        this.logger.log(`[CONTROLLER] S3 event processing complete: ${successCount}/${totalCount} successful`, 'InboundEmailController');
        this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST END (SUCCESS - PROCESSED ${successCount}/${totalCount}) =====`, 'InboundEmailController');

        return {
          success: results.every((r) => r.success),
          message: `Processed ${successCount} of ${totalCount} email(s)`,
          id: results.find((r) => r.id)?.id,
          attachments: results.find((r) => r.attachments !== undefined)?.attachments,
        };
      }

      // Handle manual processing format
      this.logger.log(`[CONTROLLER] Checking for manual processing format (bucket/key)`, 'InboundEmailController');
      const { bucket, key } = req.body;
      if (!bucket || !key) {
        this.logger.warn(`[CONTROLLER] ⚠️ Missing required parameters: bucket=${!!bucket}, key=${!!key}`, 'InboundEmailController');
        this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST END (ERROR - MISSING PARAMS) =====`, 'InboundEmailController');
        return {
          success: false,
          message: 'Missing required parameters: bucket and key',
        };
      }

      this.logger.log(`[CONTROLLER] Manual S3 processing: bucket=${bucket}, key=${key}`, 'InboundEmailController');
      try {
        this.logger.log(`[CONTROLLER] Calling processEmailFromS3 for manual processing: bucket=${bucket}, key=${key}`, 'InboundEmailController');
        const result = await this.inboundEmailService.processEmailFromS3(bucket, key);
        this.logger.log(`[CONTROLLER] ✅ Successfully processed email from S3: id=${result.id}, attachments=${result.attachmentsCount}`, 'InboundEmailController');
        this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST END (SUCCESS - MANUAL PROCESSING) =====`, 'InboundEmailController');
        return {
          success: true,
          message: 'Email processed successfully from S3',
          id: result.id,
          attachments: result.attachmentsCount,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`[CONTROLLER] ❌ Error in manual S3 processing: ${errorMessage}`, errorStack, 'InboundEmailController');
        this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST END (ERROR - MANUAL PROCESSING FAILED) =====`, 'InboundEmailController');
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[CONTROLLER] ❌❌❌ CRITICAL ERROR in processFromS3: ${errorMessage}`, errorStack, 'InboundEmailController');
      this.logger.log(`[CONTROLLER] ===== S3 EMAIL WEBHOOK REQUEST END (CRITICAL ERROR) =====`, 'InboundEmailController');
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
