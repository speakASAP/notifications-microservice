/**
 * Inbound Email Service
 * Handles inbound emails received via AWS SES SNS webhook
 */

import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
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
    private httpService: HttpService,
  ) {}

  /**
   * Handle SNS notification (subscription confirmation or email notification)
   */
  async handleSNSNotification(snsMessage: SNSMessage): Promise<void> {
    console.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION START =====`);
    console.log(`[SERVICE] SNS notification type: ${snsMessage.Type}`);
    console.log(`[SERVICE] MessageId: ${snsMessage.MessageId}`);
    console.log(`[SERVICE] TopicArn: ${snsMessage.TopicArn}`);
    console.log(`[SERVICE] Has Message field: ${!!snsMessage.Message}, Message length: ${snsMessage.Message?.length || 0}`);
    
    try {
      this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION START =====`, 'InboundEmailService');
      this.logger.log(`[SERVICE] SNS notification type: ${snsMessage.Type}`, 'InboundEmailService');
      this.logger.log(`[SERVICE] MessageId: ${snsMessage.MessageId}`, 'InboundEmailService');
      this.logger.log(`[SERVICE] TopicArn: ${snsMessage.TopicArn}`, 'InboundEmailService');
      this.logger.log(`[SERVICE] Has Message field: ${!!snsMessage.Message}, Message length: ${snsMessage.Message?.length || 0}`, 'InboundEmailService');
    } catch (e) {
      console.error(`[SERVICE] ERROR in this.logger.log: ${e}`);
    }

    if (snsMessage.Type === 'SubscriptionConfirmation') {
      console.log(`[SERVICE] SubscriptionConfirmation - handled by controller, skipping`);
      this.logger.log(`[SERVICE] SubscriptionConfirmation - handled by controller, skipping`, 'InboundEmailService');
      this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION END =====`, 'InboundEmailService');
      return;
    }

    if (snsMessage.Type === 'Notification' && snsMessage.Message) {
      console.log(`[SERVICE] Processing Notification with Message field`);
      this.logger.log(`[SERVICE] Processing Notification with Message field`, 'InboundEmailService');
      try {
        // Parse SES notification from SNS Message field (JSON string)
        console.log(`[SERVICE] Parsing Message field as JSON...`);
        this.logger.log(`[SERVICE] Parsing Message field as JSON...`, 'InboundEmailService');
        const sesNotification: SESNotification = JSON.parse(snsMessage.Message);
        console.log(`[SERVICE] ✅ Parsed SES notification successfully`);
        this.logger.log(`[SERVICE] ✅ Parsed SES notification successfully`, 'InboundEmailService');
        console.log(`[SERVICE] SES notification - source: ${sesNotification.mail?.source}, destination: ${JSON.stringify(sesNotification.mail?.destination)}`);
        this.logger.log(`[SERVICE] SES notification - source: ${sesNotification.mail?.source}, destination: ${JSON.stringify(sesNotification.mail?.destination)}, messageId: ${sesNotification.mail?.messageId}`, 'InboundEmailService');
        
        console.log(`[SERVICE] Calling parseEmailContent...`);
        this.logger.log(`[SERVICE] Calling parseEmailContent...`, 'InboundEmailService');
        const inboundEmail = await this.parseEmailContent(sesNotification);
        console.log(`[SERVICE] ✅ Parsed email content, email ID: ${inboundEmail.id || 'NEW'}, from: ${inboundEmail.from}, to: ${inboundEmail.to}`);
        this.logger.log(`[SERVICE] ✅ Parsed email content, email ID: ${inboundEmail.id || 'NEW'}, from: ${inboundEmail.from}, to: ${inboundEmail.to}`, 'InboundEmailService');
        
        console.log(`[SERVICE] Calling storeInboundEmail...`);
        this.logger.log(`[SERVICE] Calling storeInboundEmail...`, 'InboundEmailService');
        await this.storeInboundEmail(inboundEmail);
        console.log(`[SERVICE] ✅ Stored inbound email, ID: ${inboundEmail.id}`);
        this.logger.log(`[SERVICE] ✅ Stored inbound email, ID: ${inboundEmail.id}`, 'InboundEmailService');
        
        console.log(`[SERVICE] Calling processInboundEmail...`);
        this.logger.log(`[SERVICE] Calling processInboundEmail...`, 'InboundEmailService');
        await this.processInboundEmail(inboundEmail);
        console.log(`[SERVICE] ✅ Processed inbound email successfully`);
        this.logger.log(`[SERVICE] ✅ Processed inbound email successfully`, 'InboundEmailService');
        console.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION END (SUCCESS) =====`);
        this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION END (SUCCESS) =====`, 'InboundEmailService');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`[SERVICE] ❌ Failed to process SNS notification: ${errorMessage}`, errorStack);
        this.logger.error(`[SERVICE] ❌ Failed to process SNS notification: ${errorMessage}`, errorStack, 'InboundEmailService');
        this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION END (ERROR) =====`, 'InboundEmailService');
        throw error;
      }
    } else {
      console.warn(`[SERVICE] ⚠️ Unknown SNS message type or missing Message field: Type=${snsMessage.Type}, HasMessage=${!!snsMessage.Message}`);
      this.logger.warn(`[SERVICE] ⚠️ Unknown SNS message type or missing Message field: Type=${snsMessage.Type}, HasMessage=${!!snsMessage.Message}`, 'InboundEmailService');
      this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION END (IGNORED) =====`, 'InboundEmailService');
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
    this.logger.log(`[PARSE] ===== PARSE EMAIL CONTENT START =====`, 'InboundEmailService');
    this.logger.log(`[PARSE] SES messageId: ${sesNotification.mail.messageId}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Source: ${sesNotification.mail.source}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Destination: ${JSON.stringify(sesNotification.mail.destination)}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Content length (base64): ${sesNotification.content?.length || 0}`, 'InboundEmailService');

    try {
      // Decode base64 email content
      this.logger.log(`[PARSE] Decoding base64 content...`, 'InboundEmailService');
      const emailContent = Buffer.from(sesNotification.content, 'base64').toString('utf-8');
      this.logger.log(`[PARSE] ✅ Decoded content, length: ${emailContent.length}`, 'InboundEmailService');
      this.logger.log(`[PARSE] Content preview (first 200 chars): ${emailContent.substring(0, 200)}`, 'InboundEmailService');

      // Parse email headers and body
      this.logger.log(`[PARSE] Parsing email parts...`, 'InboundEmailService');
      const emailParts = this.parseEmailParts(emailContent);
      this.logger.log(`[PARSE] ✅ Parsed email parts - subject: ${emailParts.subject || 'N/A'}, bodyText length: ${emailParts.bodyText?.length || 0}, bodyHtml length: ${emailParts.bodyHtml?.length || 0}, attachments: ${emailParts.attachments?.length || 0}`, 'InboundEmailService');
      
      const from = sesNotification.mail.source;
      const to = sesNotification.mail.destination[0] || sesNotification.receipt.recipients[0] || '';
      const subject = emailParts.subject || null;
      const bodyText = emailParts.bodyText || '';
      const bodyHtml = emailParts.bodyHtml || null;
      const attachments = emailParts.attachments || [];

      this.logger.log(`[PARSE] Creating InboundEmail entity...`, 'InboundEmailService');
      const inboundEmail = new InboundEmail();
      inboundEmail.from = from;
      inboundEmail.to = to;
      inboundEmail.subject = subject;
      inboundEmail.bodyText = bodyText;
      inboundEmail.bodyHtml = bodyHtml;
      inboundEmail.attachments = attachments.length > 0 ? attachments : null;
      inboundEmail.status = 'pending';
      inboundEmail.rawData = sesNotification;

      this.logger.log(`[PARSE] ✅ Created InboundEmail - from: ${from}, to: ${to}, subject: ${subject}`, 'InboundEmailService');
      this.logger.log(`[PARSE] ===== PARSE EMAIL CONTENT END (SUCCESS) =====`, 'InboundEmailService');

      return inboundEmail;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[PARSE] ❌ Failed to parse email content: ${errorMessage}`, errorStack, 'InboundEmailService');
      this.logger.log(`[PARSE] ===== PARSE EMAIL CONTENT END (ERROR) =====`, 'InboundEmailService');
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
    console.log(`[STORE] ===== STORE INBOUND EMAIL START =====`);
    console.log(`[STORE] Email data - from: ${email.from}, to: ${email.to}, subject: ${email.subject}`);
    console.log(`[STORE] Status: ${email.status}, has rawData: ${!!email.rawData}`);
    this.logger.log(`[STORE] ===== STORE INBOUND EMAIL START =====`, 'InboundEmailService');
    this.logger.log(`[STORE] Email data - from: ${email.from}, to: ${email.to}, subject: ${email.subject}`, 'InboundEmailService');
    this.logger.log(`[STORE] Status: ${email.status}, has rawData: ${!!email.rawData}`, 'InboundEmailService');
    
    try {
      console.log(`[STORE] Saving to database...`);
      this.logger.log(`[STORE] Saving to database...`, 'InboundEmailService');
      await this.inboundEmailRepository.save(email);
      console.log(`[STORE] ✅ Stored inbound email successfully - ID: ${email.id}, from: ${email.from}`);
      this.logger.log(`[STORE] ✅ Stored inbound email successfully - ID: ${email.id}, from: ${email.from}`, 'InboundEmailService');
      console.log(`[STORE] ===== STORE INBOUND EMAIL END (SUCCESS) =====`);
      this.logger.log(`[STORE] ===== STORE INBOUND EMAIL END (SUCCESS) =====`, 'InboundEmailService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[STORE] ❌ Failed to store inbound email: ${errorMessage}`, errorStack);
      this.logger.error(`[STORE] ❌ Failed to store inbound email: ${errorMessage}`, errorStack, 'InboundEmailService');
      this.logger.log(`[STORE] ===== STORE INBOUND EMAIL END (ERROR) =====`, 'InboundEmailService');
      throw error;
    }
  }

  /**
   * Process inbound email (routing, webhook handlers, etc.)
   */
  async processInboundEmail(email: InboundEmail): Promise<void> {
    this.logger.log(`[PROCESS] ===== PROCESS INBOUND EMAIL START =====`, 'InboundEmailService');
    this.logger.log(`[PROCESS] Email ID: ${email.id}, from: ${email.from}, to: ${email.to}`, 'InboundEmailService');

    try {
      // Mark as processed
      this.logger.log(`[PROCESS] Marking email as processed...`, 'InboundEmailService');
      email.status = 'processed';
      email.processedAt = new Date();
      await this.inboundEmailRepository.save(email);
      this.logger.log(`[PROCESS] ✅ Email marked as processed`, 'InboundEmailService');

      // Forward to helpdesk for ticket creation
      this.logger.log(`[PROCESS] Forwarding to helpdesk...`, 'InboundEmailService');
      await this.forwardToHelpdesk(email);
      this.logger.log(`[PROCESS] ✅ Successfully processed inbound email ${email.id}`, 'InboundEmailService');
      this.logger.log(`[PROCESS] ===== PROCESS INBOUND EMAIL END (SUCCESS) =====`, 'InboundEmailService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[PROCESS] ❌ Failed to process inbound email ${email.id}: ${errorMessage}`, errorStack, 'InboundEmailService');
      
      this.logger.log(`[PROCESS] Marking email as failed...`, 'InboundEmailService');
      email.status = 'failed';
      email.error = errorMessage;
      await this.inboundEmailRepository.save(email);
      
      this.logger.log(`[PROCESS] ===== PROCESS INBOUND EMAIL END (ERROR) =====`, 'InboundEmailService');
      throw error;
    }
  }

  /**
   * Forward inbound email to helpdesk system for ticket creation
   */
  private async forwardToHelpdesk(email: InboundEmail): Promise<void> {
    this.logger.log(`[FORWARD] ===== FORWARD TO HELPDESK START =====`, 'InboundEmailService');
    const helpdeskUrl = process.env.HELPDESK_WEBHOOK_URL || 'https://speakasap.com/helpdesk/api/email/inbound/';
    this.logger.log(`[FORWARD] Helpdesk URL: ${helpdeskUrl}`, 'InboundEmailService');
    
    if (!helpdeskUrl) {
      this.logger.warn(`[FORWARD] ⚠️ HELPDESK_WEBHOOK_URL not configured, skipping helpdesk forwarding`, 'InboundEmailService');
      this.logger.log(`[FORWARD] ===== FORWARD TO HELPDESK END (SKIPPED) =====`, 'InboundEmailService');
      return;
    }

    try {
      // Reconstruct SNS message format that helpdesk expects
      this.logger.log(`[FORWARD] Reconstructing SNS message format...`, 'InboundEmailService');
      this.logger.log(`[FORWARD] Email ID: ${email.id}, from: ${email.from}, to: ${email.to}`, 'InboundEmailService');
      this.logger.log(`[FORWARD] Has rawData: ${!!email.rawData}, has rawData.mail: ${!!email.rawData?.mail}`, 'InboundEmailService');
      
      const messageData = {
        mail: {
          source: email.from,
          destination: [email.to],
          messageId: email.rawData?.mail?.messageId || `inbound-${email.id}`,
          timestamp: email.receivedAt?.toISOString() || new Date().toISOString(),
        },
        receipt: {
          recipients: [email.to],
          spamVerdict: email.rawData?.receipt?.spamVerdict || { status: 'PASS' },
          virusVerdict: email.rawData?.receipt?.virusVerdict || { status: 'PASS' },
          spfVerdict: email.rawData?.receipt?.spfVerdict || { status: 'PASS' },
          dkimVerdict: email.rawData?.receipt?.dkimVerdict || { status: 'PASS' },
          dmarcVerdict: email.rawData?.receipt?.dmarcVerdict || { status: 'PASS' },
        },
        content: email.rawData?.content || this.encodeEmailContent(email),
      };
      
      const snsMessage = {
        Type: 'Notification',
        Message: JSON.stringify(messageData),
        MessageId: email.rawData?.MessageId || `msg-${email.id}`,
        TopicArn: process.env.AWS_SES_SNS_TOPIC_ARN || '',
      };

      this.logger.log(`[FORWARD] SNS message prepared - Type: ${snsMessage.Type}, MessageId: ${snsMessage.MessageId}`, 'InboundEmailService');
      this.logger.log(`[FORWARD] Message data preview - source: ${messageData.mail.source}, destination: ${JSON.stringify(messageData.mail.destination)}`, 'InboundEmailService');
      this.logger.log(`[FORWARD] Sending POST request to helpdesk...`, 'InboundEmailService');

      const response = await this.httpService.post(helpdeskUrl, snsMessage, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }).toPromise();

      this.logger.log(`[FORWARD] ✅ Forwarded inbound email ${email.id} to helpdesk - Status: ${response?.status}`, 'InboundEmailService');
      this.logger.log(`[FORWARD] Response status: ${response?.status}, statusText: ${response?.statusText}`, 'InboundEmailService');
      this.logger.log(`[FORWARD] ===== FORWARD TO HELPDESK END (SUCCESS) =====`, 'InboundEmailService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[FORWARD] ❌ Failed to forward email ${email.id} to helpdesk: ${errorMessage}`, errorStack, 'InboundEmailService');
      
      if (error && typeof error === 'object' && 'response' in error) {
        const httpError = error as any;
        this.logger.error(`[FORWARD] HTTP Error - Status: ${httpError.response?.status}, StatusText: ${httpError.response?.statusText}`, undefined, 'InboundEmailService');
        this.logger.error(`[FORWARD] HTTP Error - Response body: ${JSON.stringify(httpError.response?.data)?.substring(0, 500)}`, undefined, 'InboundEmailService');
      }
      
      this.logger.log(`[FORWARD] ===== FORWARD TO HELPDESK END (ERROR - non-critical) =====`, 'InboundEmailService');
      // Don't throw - email is already stored, helpdesk forwarding failure is not critical
    }
  }

  /**
   * Encode email content back to base64 for helpdesk compatibility
   */
  private encodeEmailContent(email: InboundEmail): string {
    // Reconstruct email in RFC 2822 format
    let emailContent = `From: ${email.from}\r\n`;
    emailContent += `To: ${email.to}\r\n`;
    if (email.subject) {
      emailContent += `Subject: ${email.subject}\r\n`;
    }
    emailContent += `Content-Type: ${email.bodyHtml ? 'multipart/alternative' : 'text/plain'}\r\n`;
    emailContent += `\r\n`;
    
    if (email.bodyHtml) {
      emailContent += `--boundary\r\n`;
      emailContent += `Content-Type: text/plain\r\n\r\n`;
      emailContent += email.bodyText;
      emailContent += `\r\n--boundary\r\n`;
      emailContent += `Content-Type: text/html\r\n\r\n`;
      emailContent += email.bodyHtml;
      emailContent += `\r\n--boundary--\r\n`;
    } else {
      emailContent += email.bodyText;
    }

    return Buffer.from(emailContent).toString('base64');
  }
}
