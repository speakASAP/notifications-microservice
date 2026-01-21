/**
 * Email Service
 * Handles email notifications via SendGrid and AWS SES
 */

import { Injectable, Inject } from '@nestjs/common';
import * as sgMail from '@sendgrid/mail';
import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { LoggerService } from '../../shared/logger/logger.service';

export type EmailContentType = 'text/plain' | 'text/html';

export interface EmailOptions {
  to: string;
  subject: string;
  message: string;
  templateData?: Record<string, unknown>;
  emailProvider?: 'sendgrid' | 'ses' | 'auto'; // Per-request provider selection
  contentType?: EmailContentType; // Content type: 'text/html' or 'text/plain' (default: auto-detect)
  rawMessage?: string | Buffer; // When provided, send raw MIME via SES without modifications
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

    // If rawMessage is provided, send raw email via SES without modifications
    if (options.rawMessage) {
      this.logger.log(`Raw email provided, sending via SES as-is`, 'EmailService');
      return await this.sendRawViaSES(options);
    }

    // Determine content type: explicit > auto-detect > default
    const contentType = options.contentType || this.detectContentType(options.message) || 'text/plain';
    this.logger.log(`Email content type: ${contentType}`, 'EmailService');

    // Determine provider: per-request > env var > default
    const provider = options.emailProvider ||
      (process.env.EMAIL_PROVIDER as 'sendgrid' | 'ses' | 'auto') ||
      'sendgrid';

    this.logger.log(`Using email provider: ${provider}`, 'EmailService');

    // Handle provider selection
    if (provider === 'ses') {
      return await this.sendViaSES({ ...options, contentType });
    } else if (provider === 'auto') {
      // Try SES first, fallback to SendGrid on failure
      try {
        return await this.sendViaSES({ ...options, contentType });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`AWS SES failed, falling back to SendGrid: ${errorMessage}`, 'EmailService');
        return await this.sendViaSendGrid({ ...options, contentType });
      }
    }

    // Default to SendGrid
    return await this.sendViaSendGrid({ ...options, contentType });
  }

  /**
   * Send raw MIME email via AWS SES (no modifications)
   */
  private async sendRawViaSES(options: EmailOptions): Promise<EmailSendResult> {
    if (!this.sesClient) {
      throw new Error('AWS SES client not initialized. Please provide AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, and AWS_SES_SECRET_ACCESS_KEY');
    }

    try {
      const rawBuffer = Buffer.isBuffer(options.rawMessage)
        ? options.rawMessage
        : Buffer.from(options.rawMessage as string, 'base64');

      const command = new SendRawEmailCommand({
        Source: this.fromEmail,
        Destinations: [options.to],
        RawMessage: { Data: rawBuffer },
      });

      const response = await this.sesClient.send(command);
      const messageId = response.MessageId;

      this.logger.log(`Raw email sent successfully via AWS SES to ${options.to}, messageId: ${messageId}`, 'EmailService');

      return {
        success: true,
        messageId: messageId,
        channel: 'email',
        recipient: options.to,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`AWS SES raw email sending failed to ${options.to}: ${errorMessage}`, errorStack, 'EmailService');
      throw new Error(`AWS SES raw email sending failed: ${errorMessage}`);
    }
  }

  /**
   * Auto-detect content type based on message content
   */
  private detectContentType(message: string): EmailContentType | null {
    // Check if message contains HTML tags
    const htmlTagPattern = /<[a-z][\s\S]*>/i;
    if (htmlTagPattern.test(message)) {
      return 'text/html';
    }
    return null;
  }

  /**
   * Send email via AWS SES
   */
  private async sendViaSES(options: EmailOptions & { contentType: EmailContentType }): Promise<EmailSendResult> {
    if (!this.sesClient) {
      throw new Error('AWS SES client not initialized. Please provide AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, and AWS_SES_SECRET_ACCESS_KEY');
    }

    this.logger.log(`Sending email via AWS SES to ${options.to}`, 'EmailService');

    try {
      const { textBody, htmlBody } = this.prepareEmailBody(
        options.message,
        options.contentType,
        options.templateData,
      );

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
              Data: textBody,
              Charset: 'UTF-8',
            },
            Html: {
              Data: htmlBody,
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
  private async sendViaSendGrid(options: EmailOptions & { contentType: EmailContentType }): Promise<EmailSendResult> {
    this.logger.log(`Sending email via SendGrid to ${options.to}`, 'EmailService');

    try {
      const { textBody, htmlBody } = this.prepareEmailBody(
        options.message,
        options.contentType,
        options.templateData,
      );

      const msg = {
        to: options.to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: options.subject,
        text: textBody,
        html: htmlBody,
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

  /**
   * Prepare email body for both text and HTML versions
   */
  private prepareEmailBody(
    message: string,
    contentType: EmailContentType,
    templateData?: Record<string, unknown>,
  ): { textBody: string; htmlBody: string } {
    // Apply template data if provided
    let processedMessage = message;
    if (templateData) {
      Object.entries(templateData).forEach(([key, value]) => {
        processedMessage = processedMessage.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      });
    }

    let textBody: string;
    let htmlBody: string;

    if (contentType === 'text/html') {
      // Message is already HTML
      htmlBody = processedMessage;
      // Create plain text version by stripping HTML tags
      textBody = this.htmlToPlainText(processedMessage);
    } else {
      // Message is plain text
      textBody = processedMessage;
      // Convert plain text to HTML
      htmlBody = this.textToHtml(processedMessage);
    }

    return { textBody, htmlBody };
  }

  /**
   * Convert plain text to HTML
   */
  private textToHtml(text: string): string {
    // Escape HTML special characters
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Convert line breaks to <br>
    const withBreaks = escaped.replace(/\n/g, '<br>');

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
          ${withBreaks}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Convert HTML to plain text (strip HTML tags)
   */
  private htmlToPlainText(html: string): string {
    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, '');
    // Decode HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ');
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }
}

