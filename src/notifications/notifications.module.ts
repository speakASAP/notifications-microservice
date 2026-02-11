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
import { WebhookDeliveryService } from '../email/webhook-delivery.service';
import { WebhookSubscriptionService } from '../email/webhook-subscription.service';
import { WebhookSubscriptionController } from '../email/webhook-subscription.controller';
import { S3UnprocessedCatchupScheduler } from '../email/s3-unprocessed-catchup.scheduler';
import { TelegramService } from '../telegram/telegram.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Notification } from './entities/notification.entity';
import { InboundEmail } from '../email/entities/inbound-email.entity';
import { WebhookSubscription } from '../email/entities/webhook-subscription.entity';
import { WebhookDelivery } from '../email/entities/webhook-delivery.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Notification, InboundEmail, WebhookSubscription, WebhookDelivery]),
  ],
  controllers: [
    NotificationsController,
    InboundEmailController,
    WebhookSubscriptionController,
  ],
  providers: [
    NotificationsService,
    EmailService,
    InboundEmailService,
    WebhookDeliveryService,
    WebhookSubscriptionService,
    S3UnprocessedCatchupScheduler,
    TelegramService,
    WhatsAppService,
  ],
  exports: [NotificationsService, WebhookSubscriptionService, InboundEmailService],
})
export class NotificationsModule {}
