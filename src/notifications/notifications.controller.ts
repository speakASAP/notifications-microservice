/**
 * Notifications Controller
 */

import { Controller, Post, Get, Body, Param, Query, HttpException, HttpStatus, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { ApiResponseUtil } from '../../shared/utils/api-response.util';
import { LoggerService } from '../../shared/logger/logger.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private logger: LoggerService,
  ) {}

  @Post('send')
  async sendNotification(@Body() sendNotificationDto: SendNotificationDto, @Req() req: any) {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers?.['user-agent'] || 'unknown';

    this.logger.log(
      `[NotificationsController] POST /notifications/send - Request ID: ${requestId} - Incoming request - channel=${sendNotificationDto.channel}, recipient=${sendNotificationDto.recipient}, subject=${sendNotificationDto.subject || 'none'}, type=${sendNotificationDto.type}, service=${sendNotificationDto.service || 'none'}, clientIp=${clientIp}, userAgent=${userAgent}, messageLength=${sendNotificationDto.message?.length || 0}`,
      'NotificationsController',
    );

    try {
      const result = await this.notificationsService.send(sendNotificationDto);
      const duration = Date.now() - startTime;
      this.logger.log(
        `[NotificationsController] POST /notifications/send - Request ID: ${requestId} - Success after ${duration}ms - notificationId=${result.id}, status=${result.status}`,
        'NotificationsController',
      );
      return ApiResponseUtil.success(result);
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[NotificationsController] POST /notifications/send - Request ID: ${requestId} - Error after ${duration}ms: ${errorMessage} - channel=${sendNotificationDto.channel}, recipient=${sendNotificationDto.recipient}, subject=${sendNotificationDto.subject || 'none'}`,
        errorStack,
        'NotificationsController',
      );
      throw new HttpException(
        ApiResponseUtil.error('SEND_FAILED', errorMessage),
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
        limit || 50,
        offset || 0,
      );
      return ApiResponseUtil.success(history);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        ApiResponseUtil.error('HISTORY_FAILED', errorMessage),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:id')
  async getStatus(@Param('id') id: string) {
    try {
      const status = await this.notificationsService.getStatus(id);
      return ApiResponseUtil.success(status);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error && error.message.includes('not found')) {
        throw new HttpException(
          ApiResponseUtil.error('NOT_FOUND', errorMessage),
          HttpStatus.NOT_FOUND,
        );
      }
      throw new HttpException(
        ApiResponseUtil.error('STATUS_FAILED', errorMessage),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
