/**
 * Send Notification DTO
 */

import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsObject,
  IsArray,
} from 'class-validator';

export enum NotificationChannel {
  EMAIL = 'email',
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
}

export enum NotificationType {
  ORDER_CONFIRMATION = 'order_confirmation',
  PAYMENT_CONFIRMATION = 'payment_confirmation',
  ORDER_STATUS_UPDATE = 'order_status_update',
  SHIPMENT_TRACKING = 'shipment_tracking',
  CUSTOM = 'custom',
}

export class SendNotificationDto {
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  @IsNotEmpty()
  recipient: string; // Email, phone number, or Telegram chat ID

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsObject()
  @IsOptional()
  templateData?: Record<string, any>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[];
}
