/**
 * Email Service
 * Handles email notifications via SendGrid
 */

import { Injectable, Inject } from '@nestjs/common';
import * as sgMail from '@sendgrid/mail';
import { LoggerService } from '../../shared/logger/logger.service';

export interface EmailOptions {
  to: string;
  subject: string;
  message: string;
  templateData?: Record<string, any>;
}

@Injectable()
export class EmailService {
  private fromEmail: string;
  private fromName: string;

  constructor(
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    }

    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@flipflop.cz';
    this.fromName = process.env.SENDGRID_FROM_NAME || 'FlipFlop.cz';
  }

  async send(options: EmailOptions): Promise<any> {
    this.logger.log(`Sending email to ${options.to} with subject: ${options.subject}`, 'EmailService');

    try {
      const msg = {
        to: options.to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: options.subject,
        text: options.message,
        html: this.formatHtmlMessage(options.message, options.templateData),
      };

      const response = await sgMail.send(msg);
      const messageId = response[0]?.headers['x-message-id'];

      this.logger.log(`Email sent successfully to ${options.to}, messageId: ${messageId}`, 'EmailService');

      return {
        success: true,
        messageId: messageId,
        channel: 'email',
        recipient: options.to,
      };
    } catch (error: any) {
      this.logger.error(`Email sending failed to ${options.to}: ${error.message}`, error.stack, 'EmailService');
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  private formatHtmlMessage(message: string, templateData?: Record<string, any>): string {
    // Simple HTML formatting
    let html = message.replace(/\n/g, '<br>');

    // Apply template data if provided
    if (templateData) {
      Object.entries(templateData).forEach(([key, value]) => {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      });
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          ${html}
        </div>
      </body>
      </html>
    `;
  }
}

