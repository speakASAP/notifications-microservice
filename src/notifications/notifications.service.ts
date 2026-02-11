/**
 * Notifications Service
 * Main service for sending notifications via multiple channels
 */

import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { SendNotificationDto, NotificationChannel } from './dto/send-notification.dto';
import { EmailService } from '../email/email.service';
import { TelegramService } from '../telegram/telegram.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Notification, NotificationStatus } from './entities/notification.entity';
import { LoggerService } from '../../shared/logger/logger.service';

export interface NotificationSendResult {
  id: string;
  status: string;
  channel: string;
  recipient: string;
  messageId?: string;
}

export interface NotificationHistoryItem {
  id: string;
  channel: string;
  type: string;
  recipient: string;
  subject: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  service: string | null;
  message?: string; // Include message content for detail view
  direction?: 'inbound' | 'outbound'; // Direction: inbound (received) or outbound (sent)
}

export interface NotificationStatusResult {
  id: string;
  status: string;
  channel: string;
  recipient: string;
  error: string | null;
  messageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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

  async send(sendNotificationDto: SendNotificationDto): Promise<NotificationSendResult> {
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { channel, recipient, message, subject, templateData, type } = sendNotificationDto;

    this.logger.log(
      `[NotificationsService] send() - Request ID: ${requestId} - Starting notification send - channel=${channel}, recipient=${recipient}, subject=${subject}, type=${type}, service=${sendNotificationDto.service || 'none'}, messageLength=${message?.length || 0}`,
      'NotificationsService',
    );

    // Check for duplicate notification within last 5 minutes (idempotency protection)
    // Match on recipient, subject, and type to catch duplicates even if message content varies slightly
    // Check for both SENT and PENDING status to prevent race conditions
    const duplicateCheckStart = Date.now();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    this.logger.log(
      `[NotificationsService] send() - Request ID: ${requestId} - Checking for duplicates (5min window, recipient=${recipient}, subject=${subject}, type=${type}, fiveMinutesAgo=${fiveMinutesAgo.toISOString()})`,
      'NotificationsService',
    );

    const duplicate = await this.notificationRepository.findOne({
      where: {
        channel,
        recipient,
        subject: subject || null,
        type,
        status: In([NotificationStatus.SENT, NotificationStatus.PENDING]),
        createdAt: MoreThanOrEqual(fiveMinutesAgo),
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const duplicateCheckDuration = Date.now() - duplicateCheckStart;
    if (duplicate) {
      this.logger.warn(
        `[NotificationsService] send() - Request ID: ${requestId} - DUPLICATE DETECTED after ${duplicateCheckDuration}ms - duplicateId=${duplicate.id}, duplicateStatus=${duplicate.status}, duplicateCreatedAt=${duplicate.createdAt.toISOString()}, duplicateMessageId=${duplicate.messageId || 'none'}, recipient=${recipient}, subject=${subject}, type=${type}`,
        'NotificationsService',
      );
      return {
        id: duplicate.id,
        status: 'sent',
        channel: channel,
        recipient: recipient,
        messageId: duplicate.messageId,
      };
    }

    this.logger.log(
      `[NotificationsService] send() - Request ID: ${requestId} - No duplicate found (check took ${duplicateCheckDuration}ms), creating new notification`,
      'NotificationsService',
    );

    // Create notification record with pending status
    const createStart = Date.now();
    const notification = this.notificationRepository.create({
      channel,
      type,
      recipient,
      subject: subject || null,
      message,
      templateData: templateData || null,
      status: NotificationStatus.PENDING,
      provider: channel === NotificationChannel.EMAIL ? (sendNotificationDto.emailProvider || null) : null,
      service: sendNotificationDto.service || null,
    });

    await this.notificationRepository.save(notification);
    const createDuration = Date.now() - createStart;

    this.logger.log(
      `[NotificationsService] send() - Request ID: ${requestId} - Notification record created (ID: ${notification.id}, took ${createDuration}ms). Starting send via ${channel} to ${recipient}`,
      'NotificationsService',
    );

    try {
      const sendStart = Date.now();
      let result: { messageId?: string };

      switch (channel) {
        case NotificationChannel.EMAIL: {
          this.logger.log(
            `[NotificationsService] send() - Request ID: ${requestId} - Calling emailService.send() - notificationId=${notification.id}, emailProvider=${sendNotificationDto.emailProvider || 'auto'}, contentType=${sendNotificationDto.contentType || 'auto'}`,
            'NotificationsService',
          );
          result = await this.emailService.send({
            to: recipient,
            subject: subject || this.getDefaultSubject(type),
            message,
            templateData,
            emailProvider: sendNotificationDto.emailProvider, // Pass provider selection
            contentType: sendNotificationDto.contentType, // Pass content type
          });
          const emailSendDuration = Date.now() - sendStart;
          this.logger.log(
            `[NotificationsService] send() - Request ID: ${requestId} - emailService.send() completed in ${emailSendDuration}ms - notificationId=${notification.id}, messageId=${result.messageId || 'none'}`,
            'NotificationsService',
          );
          break;
        }

        case NotificationChannel.TELEGRAM: {
          // Use chatId if provided, otherwise use recipient
          const chatId = sendNotificationDto.chatId || recipient;
          result = await this.telegramService.send({
            chatId,
            message,
            templateData,
            botToken: sendNotificationDto.botToken,
            inlineKeyboard: sendNotificationDto.inlineKeyboard,
            parseMode: sendNotificationDto.parseMode,
          });
          break;
        }

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

      // Update notification with success status and provider
      const updateStart = Date.now();
      notification.status = NotificationStatus.SENT;
      notification.messageId = result.messageId || null;
      notification.error = null;
      // Update provider if it was determined during sending (for email channel)
      if (channel === NotificationChannel.EMAIL && sendNotificationDto.emailProvider) {
        notification.provider = sendNotificationDto.emailProvider;
      }
      await this.notificationRepository.save(notification);
      const updateDuration = Date.now() - updateStart;
      const totalDuration = Date.now() - startTime;

      this.logger.log(
        `[NotificationsService] send() - Request ID: ${requestId} - Notification ${notification.id} sent successfully. Total duration: ${totalDuration}ms (update took ${updateDuration}ms) - messageId=${result.messageId || 'none'}, channel=${channel}, recipient=${recipient}`,
        'NotificationsService',
      );

      return {
        id: notification.id,
        status: 'sent',
        channel: channel,
        recipient: recipient,
        messageId: result.messageId,
      };
    } catch (error: unknown) {
      // Update notification with failed status
      const errorUpdateStart = Date.now();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      notification.status = NotificationStatus.FAILED;
      notification.error = errorMessage;
      await this.notificationRepository.save(notification);
      const errorUpdateDuration = Date.now() - errorUpdateStart;
      const totalDuration = Date.now() - startTime;

      this.logger.error(
        `[NotificationsService] send() - Request ID: ${requestId} - Failed to send notification ${notification.id} after ${totalDuration}ms (error update took ${errorUpdateDuration}ms): ${errorMessage} - channel=${channel}, recipient=${recipient}, subject=${subject || 'none'}`,
        errorStack,
        'NotificationsService',
      );

      throw new Error(`Failed to send notification: ${errorMessage}`);
    }
  }

  async getHistory(limit: number, offset: number): Promise<NotificationHistoryItem[]> {
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
      service: n.service,
      direction: 'outbound',
    }));
  }

  /**
   * Get aggregated statistics for all notifications (for admin panel)
   */
  async getStats(): Promise<{
    total: number;
    byChannel: Record<string, number>;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    last24h: number;
    last7d: number;
  }> {
    const total = await this.notificationRepository.count();

    const channelRows = await this.notificationRepository
      .createQueryBuilder('n')
      .select('n.channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .groupBy('n.channel')
      .getRawMany<{ channel: string; count: string }>();
    const byChannel: Record<string, number> = {};
    channelRows.forEach((r) => {
      byChannel[r.channel] = parseInt(r.count, 10);
    });

    const statusRows = await this.notificationRepository
      .createQueryBuilder('n')
      .select('n.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('n.status')
      .getRawMany<{ status: string; count: string }>();
    const byStatus: Record<string, number> = {};
    statusRows.forEach((r) => {
      byStatus[r.status] = parseInt(r.count, 10);
    });

    const typeRows = await this.notificationRepository
      .createQueryBuilder('n')
      .select('n.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('n.type')
      .getRawMany<{ type: string; count: string }>();
    const byType: Record<string, number> = {};
    typeRows.forEach((r) => {
      byType[r.type] = parseInt(r.count, 10);
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last24h = await this.notificationRepository
      .createQueryBuilder('n')
      .where('n.createdAt >= :date', { date: oneDayAgo })
      .getCount();
    const last7d = await this.notificationRepository
      .createQueryBuilder('n')
      .where('n.createdAt >= :date', { date: sevenDaysAgo })
      .getCount();

    return { total, byChannel, byStatus, byType, last24h, last7d };
  }

  async getStatus(id: string): Promise<NotificationStatusResult> {
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

  async getNotificationById(id: string): Promise<Notification | null> {
    return await this.notificationRepository.findOne({
      where: { id },
    });
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
