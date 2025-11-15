/**
 * WhatsApp Service
 * Handles WhatsApp Business API notifications
 */

import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../../shared/logger/logger.service';

export interface WhatsAppOptions {
  phoneNumber: string;
  message: string;
  templateData?: Record<string, unknown>;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId: string | undefined;
  channel: string;
  recipient: string;
}

@Injectable()
export class WhatsAppService {
  private phoneNumberId: string;
  private accessToken: string;
  private apiUrl: string;

  constructor(
    private httpService: HttpService,
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
  }

  async send(options: WhatsAppOptions): Promise<WhatsAppSendResult> {
    // Format phone number (remove + and spaces)
    const phoneNumber = options.phoneNumber.replace(/[+\s]/g, '');

    this.logger.log(`Sending WhatsApp message to ${phoneNumber}`, 'WhatsAppService');

    try {
      let message = options.message;

      // Apply template data
      if (options.templateData) {
        Object.entries(options.templateData).forEach(([key, value]) => {
          message = message.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        });
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/${this.phoneNumberId}/messages`,
          {
            messaging_product: 'whatsapp',
            to: phoneNumber,
            type: 'text',
            text: {
              body: message,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const messageId = response.data.messages[0]?.id;

      this.logger.log(`WhatsApp message sent successfully to ${phoneNumber}, messageId: ${messageId}`, 'WhatsAppService');

      return {
        success: true,
        messageId: messageId,
        channel: 'whatsapp',
        recipient: phoneNumber,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`WhatsApp sending failed to ${phoneNumber}: ${errorMessage}`, errorStack, 'WhatsAppService');
      throw new Error(`WhatsApp sending failed: ${errorMessage}`);
    }
  }
}

