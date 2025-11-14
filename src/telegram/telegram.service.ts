/**
 * Telegram Service
 * Handles Telegram Bot notifications
 */

import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../../shared/logger/logger.service';

export interface TelegramOptions {
  chatId: string;
  message: string;
  templateData?: Record<string, any>;
}

@Injectable()
export class TelegramService {
  private botToken: string;
  private apiUrl: string;

  constructor(
    private httpService: HttpService,
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async send(options: TelegramOptions): Promise<any> {
    this.logger.log(`Sending Telegram message to chatId: ${options.chatId}`, 'TelegramService');

    try {
      let message = options.message;

      // Apply template data
      if (options.templateData) {
        Object.entries(options.templateData).forEach(([key, value]) => {
          message = message.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        });
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/sendMessage`, {
          chat_id: options.chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      );

      const messageId = response.data.result.message_id;

      this.logger.log(`Telegram message sent successfully to ${options.chatId}, messageId: ${messageId}`, 'TelegramService');

      return {
        success: true,
        messageId: String(messageId),
        channel: 'telegram',
        recipient: options.chatId,
      };
    } catch (error: any) {
      this.logger.error(`Telegram sending failed to ${options.chatId}: ${error.message}`, error.stack, 'TelegramService');
      throw new Error(`Telegram sending failed: ${error.message}`);
    }
  }
}

