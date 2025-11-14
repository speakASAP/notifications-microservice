/**
 * Notifications Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from '../email/email.service';
import { TelegramService } from '../telegram/telegram.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Notification } from './entities/notification.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Notification]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailService,
    TelegramService,
    WhatsAppService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
