/**
 * Inbound Email Service
 * Handles inbound emails received via AWS SES SNS webhook
 */

import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '../../shared/logger/logger.service';
import { InboundEmail } from './entities/inbound-email.entity';

export interface SNSMessage {
  Type: string;
  Message?: string;
  MessageId?: string;
  TopicArn?: string;
  SubscribeURL?: string;
  Token?: string;
}

export interface SESNotification {
  mail: {
    source: string;
    destination: string[];
    messageId: string;
    timestamp: string;
  };
  receipt: {
    recipients: string[];
    spamVerdict?: { status: string };
    virusVerdict?: { status: string };
    spfVerdict?: { status: string };
    dkimVerdict?: { status: string };
    dmarcVerdict?: { status: string };
  };
  content: string; // Base64 encoded email content
}

@Injectable()
export class InboundEmailService {
  constructor(
    @InjectRepository(InboundEmail)
    private inboundEmailRepository: Repository<InboundEmail>,
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {}

  /**
   * Handle SNS notification (subscription confirmation or email notification)
   */
  async handleSNSNotification(snsMessage: SNSMessage): Promise<void> {
    this.logger.log(`Received SNS notification type: ${snsMessage.Type}`, 'InboundEmailService');

    if (snsMessage.Type === 'SubscriptionConfirmation') {
      this.logger.log('SNS subscription confirmation received', 'InboundEmailService');
      // Subscription confirmation is handled by controller
      return;
    }

    if (snsMessage.Type === 'Notification' && snsMessage.Message) {
      try {
        // Parse SES notification from SNS Message field (JSON string)
        const sesNotification: SESNotification = JSON.parse(snsMessage.Message);
        const inboundEmail = await this.parseEmailContent(sesNotification);
        await this.storeInboundEmail(inboundEmail);
        await this.processInboundEmail(inboundEmail);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`Failed to process SNS notification: ${errorMessage}`, errorStack, 'InboundEmailService');
        throw error;
      }
    } else {
      this.logger.warn(`Unknown SNS message type or missing Message field: ${snsMessage.Type}`, 'InboundEmailService');
    }
  }

  /**
   * Extract SES notification from SNS message
   */
  extractEmailFromSNS(snsMessage: SNSMessage): SESNotification | null {
    if (snsMessage.Type !== 'Notification' || !snsMessage.Message) {
      return null;
    }

    try {
      return JSON.parse(snsMessage.Message) as SESNotification;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to parse SNS Message: ${errorMessage}`, undefined, 'InboundEmailService');
      return null;
    }
  }

  /**
   * Parse email content from SES notification
   */
  async parseEmailContent(sesNotification: SESNotification): Promise<InboundEmail> {
    this.logger.log(`Parsing email from SES notification: ${sesNotification.mail.messageId}`, 'InboundEmailService');

    try {
      // Decode base64 email content
      const emailContent = Buffer.from(sesNotification.content, 'base64').toString('utf-8');

      // Parse email headers and body
      const emailParts = this.parseEmailParts(emailContent);
      const from = sesNotification.mail.source;
      const to = sesNotification.mail.destination[0] || sesNotification.receipt.recipients[0] || '';
      const subject = emailParts.subject || null;
      const bodyText = emailParts.bodyText || '';
      const bodyHtml = emailParts.bodyHtml || null;
      const attachments = emailParts.attachments || [];

      const inboundEmail = new InboundEmail();
      inboundEmail.from = from;
      inboundEmail.to = to;
      inboundEmail.subject = subject;
      inboundEmail.bodyText = bodyText;
      inboundEmail.bodyHtml = bodyHtml;
      inboundEmail.attachments = attachments.length > 0 ? attachments : null;
      inboundEmail.status = 'pending';
      inboundEmail.rawData = sesNotification;

      this.logger.log(`Parsed email from ${from} to ${to} with subject: ${subject}`, 'InboundEmailService');

      return inboundEmail;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to parse email content: ${errorMessage}`, errorStack, 'InboundEmailService');
      throw new Error(`Failed to parse email content: ${errorMessage}`);
    }
  }

  /**
   * Parse email parts (headers, body, attachments) from raw email content
   */
  private parseEmailParts(emailContent: string): {
    subject: string | null;
    bodyText: string;
    bodyHtml: string | null;
    attachments: any[];
  } {
    const parts = {
      subject: null as string | null,
      bodyText: '',
      bodyHtml: null as string | null,
      attachments: [] as any[],
    };

    // Split headers and body
    const headerBodySplit = emailContent.indexOf('\r\n\r\n');
    if (headerBodySplit === -1) {
      // No headers, entire content is body
      parts.bodyText = emailContent;
      return parts;
    }

    const headers = emailContent.substring(0, headerBodySplit);
    const body = emailContent.substring(headerBodySplit + 4);

    // Extract subject from headers
    const subjectMatch = headers.match(/^Subject:\s*(.+)$/im);
    if (subjectMatch) {
      parts.subject = this.decodeHeader(subjectMatch[1]);
    }

    // Check if multipart message
    if (headers.includes('Content-Type: multipart')) {
      // Parse multipart message
      const boundaryMatch = headers.match(/boundary="?([^";\r\n]+)"?/i);
      if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const multipartParts = this.parseMultipart(body, boundary);
        for (const part of multipartParts) {
          if (part.contentType?.includes('text/plain')) {
            parts.bodyText = part.content || '';
          } else if (part.contentType?.includes('text/html')) {
            parts.bodyHtml = part.content || null;
          } else if (part.contentDisposition?.includes('attachment')) {
            parts.attachments.push({
              filename: part.filename || 'attachment',
              contentType: part.contentType || 'application/octet-stream',
              content: part.content,
            });
          }
        }
      }
    } else {
      // Simple message, check content type
      if (headers.includes('Content-Type: text/html')) {
        parts.bodyHtml = body;
        parts.bodyText = this.stripHtml(body);
      } else {
        parts.bodyText = body;
      }
    }

    return parts;
  }

  /**
   * Parse multipart message
   */
  private parseMultipart(body: string, boundary: string): Array<{
    contentType?: string;
    contentDisposition?: string;
    filename?: string;
    content: string;
  }> {
    const parts: Array<{
      contentType?: string;
      contentDisposition?: string;
      filename?: string;
      content: string;
    }> = [];

    const boundaryRegex = new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const sections = body.split(boundaryRegex).filter((s) => s.trim() && !s.includes('--'));

    for (const section of sections) {
      const headerBodySplit = section.indexOf('\r\n\r\n');
      if (headerBodySplit === -1) continue;

      const partHeaders = section.substring(0, headerBodySplit);
      const partContent = section.substring(headerBodySplit + 4);

      const contentTypeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
      const contentDispositionMatch = partHeaders.match(/Content-Disposition:\s*([^;\r\n]+)/i);
      const filenameMatch = partHeaders.match(/filename="?([^";\r\n]+)"?/i);

      parts.push({
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : undefined,
        contentDisposition: contentDispositionMatch ? contentDispositionMatch[1].trim() : undefined,
        filename: filenameMatch ? this.decodeHeader(filenameMatch[1]) : undefined,
        content: partContent,
      });
    }

    return parts;
  }

  /**
   * Decode email header (handles quoted-printable and base64)
   */
  private decodeHeader(header: string): string {
    // Simple decode - handle =?charset?encoding?text?= format
    return header.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (match, charset, encoding, text) => {
      if (encoding.toUpperCase() === 'B') {
        // Base64
        return Buffer.from(text, 'base64').toString(charset || 'utf-8');
      } else if (encoding.toUpperCase() === 'Q') {
        // Quoted-printable
        return text.replace(/=([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
      }
      return text;
    });
  }

  /**
   * Strip HTML tags to get plain text
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&[^;]+;/g, '');
  }

  /**
   * Store inbound email in database
   */
  async storeInboundEmail(email: InboundEmail): Promise<void> {
    try {
      await this.inboundEmailRepository.save(email);
      this.logger.log(`Stored inbound email ${email.id} from ${email.from}`, 'InboundEmailService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to store inbound email: ${errorMessage}`, errorStack, 'InboundEmailService');
      throw error;
    }
  }

  /**
   * Process inbound email (routing, webhook handlers, etc.)
   */
  async processInboundEmail(email: InboundEmail): Promise<void> {
    this.logger.log(`Processing inbound email ${email.id} from ${email.from}`, 'InboundEmailService');

    try {
      // Mark as processed
      email.status = 'processed';
      email.processedAt = new Date();
      await this.inboundEmailRepository.save(email);

      this.logger.log(`Processed inbound email ${email.id}`, 'InboundEmailService');

      // TODO: Add routing logic here (e.g., forward to helpdesk, process ticket creation, etc.)
      // This will be implemented by Agent 3 when integrating with helpdesk
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      email.status = 'failed';
      email.error = errorMessage;
      await this.inboundEmailRepository.save(email);

      this.logger.error(`Failed to process inbound email ${email.id}: ${errorMessage}`, errorStack, 'InboundEmailService');
      throw error;
    }
  }
}
