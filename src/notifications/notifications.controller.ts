/**
 * Notifications Controller
 */

import { Controller, Post, Get, Body, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { ApiResponseUtil } from '../../shared/utils/api-response.util';

@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Post('send')
  async sendNotification(@Body() sendNotificationDto: SendNotificationDto) {
    try {
      const result = await this.notificationsService.send(sendNotificationDto);
      return ApiResponseUtil.success(result);
    } catch (error: any) {
      throw new HttpException(
        ApiResponseUtil.error('SEND_FAILED', error.message),
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
    } catch (error: any) {
      throw new HttpException(
        ApiResponseUtil.error('HISTORY_FAILED', error.message),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:id')
  async getStatus(@Param('id') id: string) {
    try {
      const status = await this.notificationsService.getStatus(id);
      return ApiResponseUtil.success(status);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        throw new HttpException(
          ApiResponseUtil.error('NOT_FOUND', error.message),
          HttpStatus.NOT_FOUND,
        );
      }
      throw new HttpException(
        ApiResponseUtil.error('STATUS_FAILED', error.message),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
