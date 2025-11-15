/**
 * Telegram Service
 * Handles Telegram Bot notifications
 */

import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../../shared/logger/logger.service';
import { InlineKeyboardButton, TelegramParseMode } from '../notifications/dto/send-notification.dto';

export interface TelegramOptions {
  chatId: string;
  message: string;
  templateData?: Record<string, unknown>;
  botToken?: string; // Optional per-request bot token (overrides global)
  inlineKeyboard?: InlineKeyboardButton[][]; // Optional inline keyboard
  parseMode?: TelegramParseMode; // Optional parse mode (default: HTML)
}

export interface TelegramSendResult {
  success: boolean;
  messageId: string;
  channel: string;
  recipient: string;
}

export interface TelegramSendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode: string;
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}

@Injectable()
export class TelegramService {
  private globalBotToken: string;
  private telegramApiUrl: string;

  constructor(
    private httpService: HttpService,
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {
    this.globalBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.telegramApiUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org/bot';
  }

  async send(options: TelegramOptions): Promise<TelegramSendResult> {
    // Use per-request bot token if provided, otherwise use global
    const botToken = options.botToken || this.globalBotToken;
    const apiUrl = `${this.telegramApiUrl}${botToken}`;
    const usingGlobalToken = !options.botToken;

    if (!botToken) {
      throw new Error('Telegram bot token is required. Provide it in .env (TELEGRAM_BOT_TOKEN) or in the request (botToken)');
    }

    if (!options.chatId) {
      throw new Error('Telegram chat ID is required');
    }

    this.logger.log(
      `Sending Telegram message to chatId: ${options.chatId} using ${usingGlobalToken ? 'global' : 'per-request'} bot token`,
      'TelegramService',
    );

    try {
      let message = options.message;

      // Apply template data
      if (options.templateData) {
        Object.entries(options.templateData).forEach(([key, value]) => {
          message = message.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        });
      }

      // Build request payload
      const payload: TelegramSendMessagePayload = {
        chat_id: options.chatId,
        text: message,
        parse_mode: options.parseMode || TelegramParseMode.HTML,
      };

      // Add inline keyboard if provided
      if (options.inlineKeyboard && options.inlineKeyboard.length > 0) {
        payload.reply_markup = {
          inline_keyboard: options.inlineKeyboard,
        };
      }

      const response = await firstValueFrom(
        this.httpService.post(`${apiUrl}/sendMessage`, payload),
      );

      const messageId = response.data.result.message_id;

      this.logger.log(
        `Telegram message sent successfully to ${options.chatId}, messageId: ${messageId}`,
        'TelegramService',
      );

      return {
        success: true,
        messageId: String(messageId),
        channel: 'telegram',
        recipient: options.chatId,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Telegram sending failed to ${options.chatId}: ${errorMessage}`,
        errorStack,
        'TelegramService',
      );
      throw new Error(`Telegram sending failed: ${errorMessage}`);
    }
  }
}
