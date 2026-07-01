import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '../../../shared/logger/logger.service';
import {
  Notification,
  NotificationStatus,
} from '../entities/notification.entity';
import {
  EmailContentType,
  NotificationChannel,
  NotificationType,
  SendNotificationDto,
} from '../dto/send-notification.dto';
import { NotificationsService } from '../notifications.service';
import {
  ORDERS_EVENT_TYPES,
  OrdersEventType,
  VerifiedOrdersEventEnvelope,
  validateOrdersEventEnvelope,
} from './order-event.dto';

export type OrdersEventNotificationResult =
  | {
      action: 'sent';
      eventId: string;
      eventType: OrdersEventType;
      notificationId: string;
    }
  | {
      action: 'deduped';
      eventId: string;
      eventType: OrdersEventType;
      notificationId: string;
    }
  | {
      action: 'skipped';
      eventId: string;
      eventType: OrdersEventType;
      reason: string;
    }
  | {
      action: 'ignored';
      reason: string;
    };

@Injectable()
export class OrdersEventNotificationRouter {
  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @Inject(LoggerService)
    private readonly logger: LoggerService,
  ) {}

  async route(input: unknown): Promise<OrdersEventNotificationResult> {
    const validation = validateOrdersEventEnvelope(input);
    if (validation.valid === false) {
      this.logger.warn(
        `[OrdersEventNotificationRouter] ignored invalid Orders event reason=${validation.reason}`,
        'OrdersEventNotificationRouter',
      );
      return { action: 'ignored', reason: validation.reason };
    }

    const event = validation.event;
    const existingNotification = await this.findExistingNotification(event.eventId);
    if (existingNotification) {
      this.logger.log(
        `[OrdersEventNotificationRouter] deduped Orders event eventId=${event.eventId} eventType=${event.type} notificationId=${existingNotification.id}`,
        'OrdersEventNotificationRouter',
      );
      return {
        action: 'deduped',
        eventId: event.eventId,
        eventType: event.type,
        notificationId: existingNotification.id,
      };
    }

    const dto = this.toSendNotificationDto(event);
    if (!dto) {
      this.logger.warn(
        `[OrdersEventNotificationRouter] skipped Orders event eventId=${event.eventId} eventType=${event.type} reason=missing_orders_events_notification_recipient`,
        'OrdersEventNotificationRouter',
      );
      return {
        action: 'skipped',
        eventId: event.eventId,
        eventType: event.type,
        reason: 'missing_orders_events_notification_recipient',
      };
    }

    const result = await this.notificationsService.send(dto);
    this.logger.log(
      `[OrdersEventNotificationRouter] routed Orders event eventId=${event.eventId} eventType=${event.type} notificationId=${result.id}`,
      'OrdersEventNotificationRouter',
    );

    return {
      action: 'sent',
      eventId: event.eventId,
      eventType: event.type,
      notificationId: result.id,
    };
  }

  private async findExistingNotification(eventId: string): Promise<Notification | null> {
    return this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification."templateData" @> :eventFilter', {
        eventFilter: JSON.stringify({ ordersEvent: { eventId } }),
      })
      .andWhere('notification.status IN (:...statuses)', {
        statuses: [NotificationStatus.PENDING, NotificationStatus.SENT],
      })
      .orderBy('notification."createdAt"', 'DESC')
      .getOne();
  }

  private toSendNotificationDto(event: VerifiedOrdersEventEnvelope): SendNotificationDto | null {
    const recipient = this.readConfiguredRecipient();
    if (!recipient) {
      return null;
    }

    const eventSummary = this.summarizeEvent(event);
    const dto: SendNotificationDto = {
      channel: this.readConfiguredChannel(),
      type: this.mapNotificationType(event),
      recipient,
      subject: eventSummary.subject,
      message: eventSummary.message,
      templateData: this.buildTemplateData(event),
      service: 'orders-microservice',
      channelKey: process.env.ORDERS_EVENTS_NOTIFICATION_CHANNEL_KEY || 'orders.lifecycle',
      purpose: 'transactional',
    };

    if (dto.channel === NotificationChannel.EMAIL) {
      dto.contentType = EmailContentType.TEXT;
    }

    return dto;
  }

  private readConfiguredRecipient(): string | null {
    const value = process.env.ORDERS_EVENTS_NOTIFICATION_RECIPIENT;
    if (!value || value.trim().length === 0) {
      return null;
    }
    return value.trim();
  }

  private readConfiguredChannel(): NotificationChannel {
    const configured = (process.env.ORDERS_EVENTS_NOTIFICATION_CHANNEL || NotificationChannel.EMAIL)
      .trim()
      .toLowerCase();
    const supported: NotificationChannel[] = Object.values(NotificationChannel).filter(
      (channel) => channel !== NotificationChannel.SMS,
    );

    if (supported.includes(configured as NotificationChannel)) {
      return configured as NotificationChannel;
    }

    this.logger.warn(
      `[OrdersEventNotificationRouter] unsupported ORDERS_EVENTS_NOTIFICATION_CHANNEL=${configured}; using email`,
      'OrdersEventNotificationRouter',
    );
    return NotificationChannel.EMAIL;
  }

  private mapNotificationType(event: VerifiedOrdersEventEnvelope): NotificationType {
    switch (event.type) {
      case ORDERS_EVENT_TYPES.created:
        return NotificationType.ORDER_CONFIRMATION;
      case ORDERS_EVENT_TYPES.paid:
        return NotificationType.PAYMENT_CONFIRMATION;
      case ORDERS_EVENT_TYPES.shipped:
        return NotificationType.SHIPMENT_TRACKING;
      case ORDERS_EVENT_TYPES.updated:
      case ORDERS_EVENT_TYPES.cancelled:
      default:
        return NotificationType.ORDER_STATUS_UPDATE;
    }
  }

  private summarizeEvent(event: VerifiedOrdersEventEnvelope): { subject: string; message: string } {
    const orderId = String(event.payload.orderId);
    switch (event.type) {
      case ORDERS_EVENT_TYPES.created:
        return {
          subject: `Order ${orderId} created`,
          message: `Orders created order ${orderId} from channel ${event.payload.channel}.`,
        };
      case ORDERS_EVENT_TYPES.updated:
        return {
          subject: `Order ${orderId} status updated`,
          message: `Orders changed order ${orderId} status to ${event.payload.status}.`,
        };
      case ORDERS_EVENT_TYPES.paid:
        return {
          subject: `Order ${orderId} paid`,
          message: `Orders recorded payment status paid for order ${orderId}.`,
        };
      case ORDERS_EVENT_TYPES.shipped:
        return {
          subject: `Order ${orderId} shipped`,
          message: `Orders recorded shipment status shipped for order ${orderId}.`,
        };
      case ORDERS_EVENT_TYPES.cancelled:
        return {
          subject: `Order ${orderId} cancelled`,
          message: `Orders accepted cancellation for order ${orderId}.`,
        };
      default:
        return {
          subject: `Order ${orderId} updated`,
          message: `Orders emitted ${event.type} for order ${orderId}.`,
        };
    }
  }

  private buildTemplateData(event: VerifiedOrdersEventEnvelope): Record<string, unknown> {
    return {
      ordersEvent: {
        eventId: event.eventId,
        eventType: event.type,
        eventVersion: event.eventVersion,
        occurredAt: event.occurredAt,
        source: event.source,
        orderId: event.payload.orderId,
        channel: event.payload.channel,
        status: event.payload.status,
        previousStatus: event.payload.previousStatus,
        paymentStatus: event.payload.paymentStatus,
        shipmentStatus: event.payload.shipmentStatus,
      },
    };
  }
}
