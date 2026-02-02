/**
 * Admin Controller
 * Protected endpoints for admin panel: stats, history, service params
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ApiResponseUtil } from '../../shared/utils/api-response.util';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('stats')
  async getStats() {
    try {
      const stats = await this.notificationsService.getStats();
      return ApiResponseUtil.success(stats);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
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
  ) {
    try {
      const history = await this.notificationsService.getHistory(
        limit ? Number(limit) : 50,
        offset ? Number(offset) : 0,
      );
      return ApiResponseUtil.success(history);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        ApiResponseUtil.error('HISTORY_FAILED', msg),
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
