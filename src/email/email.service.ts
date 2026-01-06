/**
 * Email Service
 * Handles email notifications via SendGrid and AWS SES
 */

import { Injectable, Inject } from '@nestjs/common';
import * as sgMail from '@sendgrid/mail';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { LoggerService } from '../../shared/logger/logger.service';

export interface EmailOptions {
  to: string;
  subject: string;
  message: string;
  templateData?: Record<string, unknown>;
  emailProvider?: 'sendgrid' | 'ses' | 'auto'; // Per-request provider selection
}

export interface EmailSendResult {
  success: boolean;
  messageId: string | undefined;
  channel: string;
  recipient: string;
}

@Injectable()
export class EmailService {
  private fromEmail: string;
  private fromName: string;
  private sesClient: SESClient | null = null;

  constructor(
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {
    // Initialize SendGrid
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    }

    // Initialize AWS SES client if credentials are provided
    const sesRegion = process.env.AWS_SES_REGION;
    const sesAccessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
    const sesSecretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;

    if (sesRegion && sesAccessKeyId && sesSecretAccessKey) {
      this.sesClient = new SESClient({
        region: sesRegion,
        credentials: {
          accessKeyId: sesAccessKeyId,
          secretAccessKey: sesSecretAccessKey,
        },
      });
      this.logger.log('AWS SES client initialized', 'EmailService');
    } else {
      this.logger.log('AWS SES credentials not provided, SES sending will be unavailable', 'EmailService');
    }

    // Set default from email/name (prefer SES, fallback to SendGrid)
    this.fromEmail = process.env.AWS_SES_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'noreply@speakasap.com';
    this.fromName = process.env.AWS_SES_FROM_NAME || process.env.SENDGRID_FROM_NAME || 'SpeakASAP';
  }

  async send(options: EmailOptions): Promise<EmailSendResult> {
    this.logger.log(`Sending email to ${options.to} with subject: ${options.subject}`, 'EmailService');

    // Determine provider: per-request > env var > default
    const provider = options.emailProvider ||
      (process.env.EMAIL_PROVIDER as 'sendgrid' | 'ses' | 'auto') ||
      'sendgrid';

    this.logger.log(`Using email provider: ${provider}`, 'EmailService');

    // Handle provider selection
    if (provider === 'ses') {
      return await this.sendViaSES(options);
    } else if (provider === 'auto') {
      // Try SES first, fallback to SendGrid on failure
      try {
        return await this.sendViaSES(options);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`AWS SES failed, falling back to SendGrid: ${errorMessage}`, 'EmailService');
        return await this.sendViaSendGrid(options);
      }
    }

    // Default to SendGrid
    return await this.sendViaSendGrid(options);
  }

  /**
   * Send email via AWS SES
   */
  private async sendViaSES(options: EmailOptions): Promise<EmailSendResult> {
    if (!this.sesClient) {
      throw new Error('AWS SES client not initialized. Please provide AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, and AWS_SES_SECRET_ACCESS_KEY');
    }

    this.logger.log(`Sending email via AWS SES to ${options.to}`, 'EmailService');

    try {
      const htmlMessage = this.formatHtmlMessage(options.message, options.templateData);

      const command = new SendEmailCommand({
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: {
          ToAddresses: [options.to],
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: options.message,
              Charset: 'UTF-8',
            },
            Html: {
              Data: htmlMessage,
              Charset: 'UTF-8',
            },
          },
        },
      });

      const response = await this.sesClient.send(command);
      const messageId = response.MessageId;

      this.logger.log(`Email sent successfully via AWS SES to ${options.to}, messageId: ${messageId}`, 'EmailService');

      return {
        success: true,
        messageId: messageId,
        channel: 'email',
        recipient: options.to,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`AWS SES email sending failed to ${options.to}: ${errorMessage}`, errorStack, 'EmailService');
      throw new Error(`AWS SES email sending failed: ${errorMessage}`);
    }
  }

  /**
   * Send email via SendGrid
   */
  private async sendViaSendGrid(options: EmailOptions): Promise<EmailSendResult> {
    this.logger.log(`Sending email via SendGrid to ${options.to}`, 'EmailService');

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

      this.logger.log(`Email sent successfully via SendGrid to ${options.to}, messageId: ${messageId}`, 'EmailService');

      return {
        success: true,
        messageId: messageId,
        channel: 'email',
        recipient: options.to,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`SendGrid email sending failed to ${options.to}: ${errorMessage}`, errorStack, 'EmailService');
      throw new Error(`SendGrid email sending failed: ${errorMessage}`);
    }
  }

  private formatHtmlMessage(message: string, templateData?: Record<string, unknown>): string {
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

