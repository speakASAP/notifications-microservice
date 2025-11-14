/**
 * Notifications Service
 * Main service for sending notifications via multiple channels
 */

import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SendNotificationDto, NotificationChannel } from './dto/send-notification.dto';
import { EmailService } from '../email/email.service';
import { TelegramService } from '../telegram/telegram.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Notification, NotificationStatus } from './entities/notification.entity';
import { LoggerService } from '../../shared/logger/logger.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private emailService: EmailService,
    private telegramService: TelegramService,
    private whatsappService: WhatsAppService,
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {}

  async send(sendNotificationDto: SendNotificationDto): Promise<any> {
    const { channel, recipient, message, subject, templateData, type } = sendNotificationDto;

    // Create notification record with pending status
    const notification = this.notificationRepository.create({
      channel: channel as any,
      type: type as any,
      recipient,
      subject: subject || null,
      message,
      templateData: templateData || null,
      status: NotificationStatus.PENDING,
    });

    await this.notificationRepository.save(notification);

    this.logger.log(`Sending notification ${notification.id} via ${channel} to ${recipient}`, 'NotificationsService');

    try {
      let result: any;

      switch (channel) {
        case NotificationChannel.EMAIL:
          result = await this.emailService.send({
            to: recipient,
            subject: subject || this.getDefaultSubject(type),
            message,
            templateData,
          });
          break;

        case NotificationChannel.TELEGRAM:
          result = await this.telegramService.send({
            chatId: recipient,
            message,
            templateData,
          });
          break;

        case NotificationChannel.WHATSAPP:
          result = await this.whatsappService.send({
            phoneNumber: recipient,
            message,
            templateData,
          });
          break;

        default:
          throw new Error(`Unsupported notification channel: ${channel}`);
      }

      // Update notification with success status
      notification.status = NotificationStatus.SENT;
      notification.messageId = result.messageId || null;
      notification.error = null;
      await this.notificationRepository.save(notification);

      this.logger.log(`Notification ${notification.id} sent successfully`, 'NotificationsService');

      return {
        id: notification.id,
        status: 'sent',
        channel: channel,
        recipient: recipient,
        messageId: result.messageId,
      };
    } catch (error: any) {
      // Update notification with failed status
      notification.status = NotificationStatus.FAILED;
      notification.error = error.message;
      await this.notificationRepository.save(notification);

      this.logger.error(`Failed to send notification ${notification.id}: ${error.message}`, error.stack, 'NotificationsService');

      throw new Error(`Failed to send notification: ${error.message}`);
    }
  }

  async getHistory(limit: number, offset: number): Promise<any[]> {
    const notifications = await this.notificationRepository.find({
      take: limit,
      skip: offset,
      order: {
        createdAt: 'DESC',
      },
    });

    return notifications.map((n) => ({
      id: n.id,
      channel: n.channel,
      type: n.type,
      recipient: n.recipient,
      subject: n.subject,
      status: n.status,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));
  }

  async getStatus(id: string): Promise<any> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new Error(`Notification with id ${id} not found`);
    }

    return {
      id: notification.id,
      status: notification.status,
      channel: notification.channel,
      recipient: notification.recipient,
      error: notification.error,
      messageId: notification.messageId,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }

  private getDefaultSubject(type: string): string {
    const subjects: Record<string, string> = {
      order_confirmation: 'Potvrzení objednávky - FlipFlop.cz',
      payment_confirmation: 'Potvrzení platby - FlipFlop.cz',
      order_status_update: 'Aktualizace stavu objednávky - FlipFlop.cz',
      shipment_tracking: 'Informace o zásilce - FlipFlop.cz',
    };
    return subjects[type] || 'Notifikace z FlipFlop.cz';
  }
}
