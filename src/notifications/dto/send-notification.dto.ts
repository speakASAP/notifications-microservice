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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

export enum TelegramParseMode {
  HTML = 'HTML',
  MARKDOWN = 'Markdown',
  MARKDOWNV2 = 'MarkdownV2',
}

export enum EmailProvider {
  SENDGRID = 'sendgrid',
  SES = 'ses',
  AUTO = 'auto',
}

/**
 * Telegram Web App interface
 */
export interface TelegramWebApp {
  url: string;
}

/**
 * Telegram Login URL interface
 */
export interface TelegramLoginUrl {
  url: string;
  forward_text?: string;
  bot_username?: string;
  request_write_access?: boolean;
}

/**
 * Telegram Callback Game interface
 */
export interface TelegramCallbackGame {
  // Empty object for callback_game
}

/**
 * Inline Keyboard Button for Telegram
 */
export class InlineKeyboardButton {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  callback_data?: string;

  @IsObject()
  @IsOptional()
  web_app?: TelegramWebApp;

  @IsObject()
  @IsOptional()
  login_url?: TelegramLoginUrl;

  @IsString()
  @IsOptional()
  switch_inline_query?: string;

  @IsString()
  @IsOptional()
  switch_inline_query_current_chat?: string;

  @IsObject()
  @IsOptional()
  callback_game?: TelegramCallbackGame;

  @IsOptional()
  pay?: boolean;
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
  templateData?: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[];

  // Telegram-specific fields
  @IsString()
  @IsOptional()
  botToken?: string; // Optional per-request bot token (overrides global)

  @IsString()
  @IsOptional()
  chatId?: string; // Optional chat ID (alternative to recipient for Telegram)

  @IsEnum(TelegramParseMode)
  @IsOptional()
  parseMode?: TelegramParseMode; // Optional parse mode (default: HTML)

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Array)
  @IsOptional()
  inlineKeyboard?: InlineKeyboardButton[][]; // Optional inline keyboard

  // Email provider selection (optional, defaults to environment variable or 'sendgrid')
  @IsEnum(EmailProvider)
  @IsOptional()
  emailProvider?: EmailProvider;
}
