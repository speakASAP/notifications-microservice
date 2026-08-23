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
  // Omitted entirely for plain-text sends: Telegram treats a missing parse_mode
  // as "no markup parsing", which is the only mode that cannot reject a body.
  parse_mode?: string;
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

  // Telegram's hard limit for sendMessage. A longer body is rejected outright
  // (400 "message is too long"), so it is truncated rather than lost -- a
  // truncated alert still tells someone something is wrong.
  private static readonly MAX_MESSAGE_LENGTH = 4096;

  private static readonly TRUNCATION_SUFFIX = '\n\n[... truncated]';

  /**
   * Escape the characters Telegram's HTML parser treats as special.
   * '&' must be replaced first, or the '&' of an entity emitted by a later
   * replacement would itself be escaped.
   */
  static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Telegram's human-readable rejection reason, when there is one. */
  private static telegramDescription(error: unknown): string {
    const data = (error as any)?.response?.data;
    return typeof data?.description === 'string' ? data.description : 'no description';
  }

  /**
   * True when Telegram rejected the request because it could not parse the
   * message body as the requested markup -- the one failure a plain-text retry
   * can actually fix. Network errors, auth failures and rate limits are NOT
   * parse errors and must propagate untouched.
   */
  private static isParseError(error: unknown): boolean {
    const status = (error as any)?.response?.status;
    if (status !== 400) {
      return false;
    }
    const description = TelegramService.telegramDescription(error).toLowerCase();
    return (
      description.includes("can't parse entities") ||
      description.includes('cant parse entities') ||
      description.includes('can not parse entities') ||
      description.includes('unsupported start tag') ||
      description.includes('unexpected end tag')
    );
  }

  private static truncate(text: string): string {
    if (text.length <= TelegramService.MAX_MESSAGE_LENGTH) {
      return text;
    }
    const budget = TelegramService.MAX_MESSAGE_LENGTH - TelegramService.TRUNCATION_SUFFIX.length;
    return text.slice(0, budget) + TelegramService.TRUNCATION_SUFFIX;
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

      message = TelegramService.truncate(message);

      // Default to PLAIN, not HTML. The previous HTML default meant any caller
      // sending machine-generated text (log tails, kubectl output, stack
      // traces) had its message silently destroyed by a stray '<': Telegram
      // rejects the whole body with 400 "can't parse entities", this service
      // returned 500, and the alert was never delivered. Callers that actually
      // want markup now opt in, so the failure mode belongs to the caller that
      // asked for parsing rather than to everyone who did not.
      const parseMode = options.parseMode || TelegramParseMode.PLAIN;

      // Build request payload. parse_mode is omitted for PLAIN: Telegram treats
      // its absence as "no parsing", which cannot reject a body.
      const payload: TelegramSendMessagePayload = {
        chat_id: options.chatId,
        text: message,
      };
      if (parseMode !== TelegramParseMode.PLAIN) {
        payload.parse_mode = parseMode;
      }

      // Add inline keyboard if provided
      if (options.inlineKeyboard && options.inlineKeyboard.length > 0) {
        payload.reply_markup = {
          inline_keyboard: options.inlineKeyboard,
        };
      }

      let response;
      try {
        response = await firstValueFrom(
          this.httpService.post(`${apiUrl}/sendMessage`, payload),
        );
      } catch (parseError: unknown) {
        // Last-resort delivery guarantee. If a markup send is rejected, retry
        // once as plain text rather than losing the message: an alert that
        // arrives with visible tags is vastly better than one nobody sees.
        // Only retried when markup was actually requested -- a PLAIN send that
        // fails did not fail for parsing reasons, so retrying it identically
        // would just double the load on a real outage.
        if (parseMode === TelegramParseMode.PLAIN || !TelegramService.isParseError(parseError)) {
          throw parseError;
        }

        const tgDescription = TelegramService.telegramDescription(parseError);
        this.logger.warn(
          `Telegram rejected ${parseMode} markup for chatId ${options.chatId} (${tgDescription}); ` +
            `retrying as plain text. The caller sent a body that is not valid ${parseMode}.`,
          'TelegramService',
        );

        const plainPayload: TelegramSendMessagePayload = {
          chat_id: options.chatId,
          text: message,
        };
        if (payload.reply_markup) {
          plainPayload.reply_markup = payload.reply_markup;
        }
        response = await firstValueFrom(
          this.httpService.post(`${apiUrl}/sendMessage`, plainPayload),
        );
      }

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
      const tgResponse = (error as any)?.response?.data;
      const tgDetail = tgResponse ? ` TG_RESPONSE: ${JSON.stringify(tgResponse)}` : '';
      this.logger.error(
        `Telegram sending failed to ${options.chatId}: ${errorMessage}${tgDetail}`,
        errorStack,
        'TelegramService',
      );
      throw new Error(`Telegram sending failed: ${errorMessage}${tgDetail}`);
    }
  }
}
