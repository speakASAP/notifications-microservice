/**
 * Admin Controller
 * Protected endpoints for admin panel: stats, history, service params
 */

import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { InboundEmailService } from '../email/inbound-email.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ApiResponseUtil } from '../../shared/utils/api-response.util';
import { LoggerService } from '../../shared/logger/logger.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly inboundEmailService: InboundEmailService,
    @Inject(LoggerService)
    private readonly logger: LoggerService,
  ) {}

  @Get('stats')
  async getStats() {
    const requestStart = Date.now();
    this.logger.log(
      `[AdminController] getStats() - START`,
      'AdminController',
    );
    try {
      const [outboundStats, inboundCount] = await Promise.all([
        (async () => {
          const t0 = Date.now();
          const s = await this.notificationsService.getStats();
          this.logger.log(
            `[AdminController] getStats() - outbound (getStats) completed in ${Date.now() - t0}ms`,
            'AdminController',
          );
          return s;
        })(),
        (async () => {
          const t0 = Date.now();
          const c = await this.inboundEmailService.getInboundCount();
          this.logger.log(
            `[AdminController] getStats() - inbound (getInboundCount) completed in ${Date.now() - t0}ms`,
            'AdminController',
          );
          return c;
        })(),
      ]);
      const totalMs = Date.now() - requestStart;
      this.logger.log(
        `[AdminController] getStats() - END success totalTimeMs=${totalMs}`,
        'AdminController',
      );
      return ApiResponseUtil.success({
        ...outboundStats,
        receivedTotal: inboundCount.total,
        receivedLast24h: inboundCount.last24h,
        receivedLast7d: inboundCount.last7d,
      });
    } catch (error: unknown) {
      const totalMs = Date.now() - requestStart;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.log(
        `[AdminController] getStats() - END failed after ${totalMs}ms: ${msg}`,
        'AdminController',
      );
      if (error instanceof Error && error.stack) {
        this.logger.error(`[AdminController] getStats() error`, error.stack, 'AdminController');
      }
      throw new HttpException(
        ApiResponseUtil.error('STATS_FAILED', msg),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('history')
  async getHistory(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('direction') direction?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('timeframe') timeframe?: string,
  ) {
    const requestStart = Date.now();
    this.logger.log(
      `[AdminController] getHistory() - START limit=${limit} offset=${offset}`,
      'AdminController',
    );
    try {
      const limitNum = limit ? Number(limit) : 50;
      const offsetNum = offset ? Number(offset) : 0;
      // Fetch enough from both so merged sort + slice is correct; cap to avoid long queries/memory (max 30 items per request guideline)
      const fetchSize = Math.min(150, offsetNum + limitNum + 100);

      // Get outbound notifications (fetchSize most recent, no skip)
      const notifications = await this.notificationsService.getHistory(
        fetchSize,
        0,
      );

      // Get inbound emails (listOnly: true = no bodyHtml/bodyText/attachments; faster and smaller payload)
      const inboundEmails = await this.inboundEmailService.findInboundEmails({
        limit: fetchSize,
        listOnly: true,
      });

      const toTime = (d: Date | null | undefined): number =>
        d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : 0;

      // Combine and sort by date (newest first); guard against null/undefined dates
      const baseCombined = [
        ...notifications.map((n) => ({
          id: n.id,
          channel: n.channel,
          service: n.service || 'unknown',
          recipient: n.recipient,
          subject: n.subject,
          status: n.status,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          direction: 'outbound' as const,
        })),
        ...inboundEmails.map((e) => ({
          id: e.id,
          channel: 'email',
          service: 'inbound',
          recipient: e.to,
          subject: e.subject,
          status: e.status,
          createdAt: e.receivedAt,
          updatedAt: e.receivedAt,
          direction: 'inbound' as const,
        })),
      ].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));

      // Fast path: no filters → behave exactly as before (only sort + paginate)
      let combined = baseCombined;
      if (direction || channel || status || timeframe) {
        if (direction) {
          const dir = direction.toLowerCase();
          if (dir === 'inbound' || dir === 'outbound') {
            combined = combined.filter((item) => item.direction === dir);
          }
        }
        if (channel) {
          const ch = channel.toLowerCase();
          combined = combined.filter(
            (item) => (item.channel || '').toLowerCase() === ch,
          );
        }
        if (status) {
          const st = status.toLowerCase();
          combined = combined.filter(
            (item) => (item.status || '').toLowerCase() === st,
          );
        }
        if (timeframe) {
          const now = Date.now();
          let thresholdTs = 0;
          if (timeframe === '24h') {
            thresholdTs = now - 24 * 60 * 60 * 1000;
          } else if (timeframe === '7d' || timeframe === '7days') {
            thresholdTs = now - 7 * 24 * 60 * 60 * 1000;
          }
          if (thresholdTs > 0) {
            combined = combined.filter(
              (item) => toTime(item.createdAt) >= thresholdTs,
            );
          }
        }
      }

      const paged = combined.slice(offsetNum, offsetNum + limitNum);

      // Ensure JSON-serializable response: Date -> ISO string (avoids non-JSON or serialization errors)
      const serialized = paged.map((item) => ({
        id: item.id,
        channel: item.channel,
        service: item.service,
        recipient: item.recipient,
        subject: item.subject,
        status: item.status,
        createdAt:
          item.createdAt instanceof Date
            ? item.createdAt.toISOString()
            : item.createdAt,
        updatedAt:
          item.updatedAt instanceof Date
            ? item.updatedAt.toISOString()
            : item.updatedAt,
        direction: item.direction,
      }));

      const totalMs = Date.now() - requestStart;
      this.logger.log(
        `[AdminController] getHistory() - END success totalTimeMs=${totalMs} count=${serialized.length}`,
        'AdminController',
      );
      return ApiResponseUtil.success(serialized);
    } catch (error: unknown) {
      const totalMs = Date.now() - requestStart;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.log(
        `[AdminController] getHistory() - END failed after ${totalMs}ms: ${msg}`,
        'AdminController',
      );
      if (error instanceof Error && error.stack) {
        this.logger.error(
          `[AdminController] getHistory() error`,
          error.stack,
          'AdminController',
        );
      }
      throw new HttpException(
        ApiResponseUtil.error('HISTORY_FAILED', msg),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('message/:id')
  async getMessageDetails(
    @Param('id') id: string,
    @Query('type') type?: string,
  ) {
    try {
      // type can be 'notification' or 'inbound' - if not provided, try both
      if (type === 'inbound' || !type) {
        try {
          const email = await this.inboundEmailService.getInboundEmailById(id);
          if (email) {
            return ApiResponseUtil.success({
              id: email.id,
              channel: 'email',
              service: 'inbound',
              recipient: email.to,
              from: email.from,
              subject: email.subject,
              message: email.bodyHtml || email.bodyText,
              bodyHtml: email.bodyHtml,
              bodyText: email.bodyText,
              attachments: email.attachments || [],
              status: email.status,
              createdAt: email.receivedAt,
              direction: 'inbound',
            });
          }
        } catch (e) {
          // Continue to try notification
        }
      }

      if (type === 'notification' || !type) {
        const notification = await this.notificationsService.getStatus(id);
        const fullNotification = await this.notificationsService.getNotificationById(id);
        return ApiResponseUtil.success({
          ...notification,
          message: fullNotification?.message,
          service: fullNotification?.service,
          direction: 'outbound',
        });
      }

      throw new HttpException(
        ApiResponseUtil.error('NOT_FOUND', 'Message not found'),
        HttpStatus.NOT_FOUND,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        ApiResponseUtil.error('MESSAGE_DETAILS_FAILED', msg),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('params')
  getServiceParams() {
    // Non-secret service parameters for admin dashboard
    const params = {
      serviceName: process.env.SERVICE_NAME || 'notifications-microservice',
      domain: process.env.DOMAIN || '',
      port: process.env.PORT || '3368',
      emailProvider: process.env.EMAIL_PROVIDER || 'sendgrid',
      nodeEnv: process.env.NODE_ENV || 'production',
      telegramConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
      whatsappConfigured: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
      sendgridConfigured: !!process.env.SENDGRID_API_KEY,
      sesConfigured: !!(
        process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_REGION
      ),
      version: '1.0.0',
    };
    return ApiResponseUtil.success(params);
  }
}
