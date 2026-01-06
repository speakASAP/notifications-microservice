/**
 * Notifications Module
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from '../email/email.service';
import { InboundEmailService } from '../email/inbound-email.service';
import { InboundEmailController } from '../email/inbound-email.controller';
import { TelegramService } from '../telegram/telegram.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Notification } from './entities/notification.entity';
import { InboundEmail } from '../email/entities/inbound-email.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Notification, InboundEmail]),
  ],
  controllers: [NotificationsController, InboundEmailController],
  providers: [
    NotificationsService,
    EmailService,
    InboundEmailService,
    TelegramService,
    WhatsAppService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
