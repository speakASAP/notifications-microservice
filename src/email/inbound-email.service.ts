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
import { WebhookDeliveryService } from './webhook-delivery.service';

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
    private webhookDeliveryService: WebhookDeliveryService,
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
      
      // Validate that we have body content
      if (!emailParts.bodyText && !emailParts.bodyHtml) {
        this.logger.warn(`[PARSE] ⚠️⚠️⚠️ EMPTY BODY DETECTED - subject: ${emailParts.subject || 'N/A'}`, 'InboundEmailService');
        this.logger.warn(`[PARSE] Email content length: ${emailContent.length}, preview: ${emailContent.substring(0, 500)}`, 'InboundEmailService');
      }
      
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

    // Check Content-Transfer-Encoding for non-multipart messages
    const transferEncodingMatch = headers.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
    const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim() : '';

    // Check if multipart message
    if (headers.includes('Content-Type: multipart')) {
      // Parse multipart message
      const boundaryMatch = headers.match(/boundary="?([^";\r\n]+)"?/i);
      if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const multipartParts = this.parseMultipart(body, boundary);
        for (const part of multipartParts) {
          // Content is already decoded in parseMultipart
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
      // Simple message, decode content first, then check content type
      const decodedBody = this.decodeContent(body, transferEncoding);
      
      if (headers.includes('Content-Type: text/html')) {
        parts.bodyHtml = decodedBody;
        parts.bodyText = this.stripHtml(decodedBody);
      } else {
        parts.bodyText = decodedBody;
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
      let partContent = section.substring(headerBodySplit + 4);

      const contentTypeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
      const contentDispositionMatch = partHeaders.match(/Content-Disposition:\s*([^;\r\n]+)/i);
      const filenameMatch = partHeaders.match(/filename="?([^";\r\n]+)"?/i);
      const transferEncodingMatch = partHeaders.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);

      // Decode content based on Content-Transfer-Encoding
      const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim().toLowerCase() : '';
      const originalLength = partContent.length;
      partContent = this.decodeContent(partContent, transferEncoding);
      
      // Log decoding result for debugging
      if (transferEncoding && originalLength !== partContent.length) {
        this.logger.log(`[PARSE] Decoded ${transferEncoding} content in part: ${originalLength} -> ${partContent.length} bytes`, 'InboundEmailService');
      }

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
   * Decode email content based on Content-Transfer-Encoding
   * Handles quoted-printable, base64, and 7bit/8bit/binary (no decoding needed)
   */
  private decodeContent(content: string, transferEncoding: string): string {
    if (!content) {
      return content;
    }

    const encoding = transferEncoding.toLowerCase().trim();

    try {
      if (encoding === 'quoted-printable' || encoding === 'qp') {
        // Decode quoted-printable encoding
        // Quoted-printable uses =XX for bytes and = at end of line for soft breaks
        // Algorithm:
        // 1. Remove soft line breaks (= followed by CRLF or LF)
        // 2. Replace =XX sequences with the actual byte value
        // 3. The result is a UTF-8 encoded string
        
        // Step 1: Remove soft line breaks (= at end of line, with optional whitespace)
        // Handle all variations: =\r\n, =\n, = \r\n, = \n, =\r, etc.
        // Soft line breaks in quoted-printable: = at end of line means line continues
        let processed = content
          .replace(/=\s*\r\n/g, '')  // = followed by optional whitespace and CRLF
          .replace(/=\s*\n/g, '')    // = followed by optional whitespace and LF
          .replace(/=\s*\r/g, '');   // = followed by optional whitespace and CR (just in case)
        
        // Step 2: Decode =XX sequences
        // Replace =XX with the actual byte (as a character with that char code)
        // Then we'll convert the whole thing to a buffer and decode as UTF-8
        const bytes: number[] = [];
        let i = 0;
        
        while (i < processed.length) {
          if (processed[i] === '=' && i + 2 < processed.length) {
            const hex = processed.substring(i + 1, i + 3);
            if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
              // Valid hex sequence - decode to byte
              bytes.push(parseInt(hex, 16));
              i += 3;
            } else {
              // Invalid sequence - log warning
              this.logger.warn(`[PARSE] Invalid quoted-printable sequence: =${hex}`, 'InboundEmailService');
              // Treat as literal character
              const charBytes = Buffer.from(processed[i], 'utf-8');
              bytes.push(...Array.from(charBytes));
              i++;
            }
          } else {
            // Regular character - get its UTF-8 byte representation
            const charBytes = Buffer.from(processed[i], 'utf-8');
            bytes.push(...Array.from(charBytes));
            i++;
          }
        }
        
        // Step 3: Convert bytes to UTF-8 string
        try {
          const buffer = Buffer.from(bytes);
          const decoded = buffer.toString('utf-8');
          this.logger.log(`[PARSE] Decoded quoted-printable: ${content.length} chars -> ${bytes.length} bytes -> ${decoded.length} chars`, 'InboundEmailService');
          return decoded;
        } catch (e) {
          this.logger.error(`[PARSE] Failed to decode quoted-printable bytes as UTF-8: ${e}`, 'InboundEmailService');
          // Fallback: try to return as string from bytes (limited to prevent memory issues)
          if (bytes.length > 100000) {
            this.logger.warn(`[PARSE] Quoted-printable content too large (${bytes.length} bytes), truncating`, 'InboundEmailService');
            return Buffer.from(bytes.slice(0, 100000)).toString('utf-8') + '...[truncated]';
          }
          return Buffer.from(bytes).toString('utf-8');
        }
      } else if (encoding === 'base64' || encoding === 'b') {
        // Decode base64
        try {
          // Remove whitespace that might interfere with base64 decoding
          const cleanContent = content.replace(/\s/g, '');
          const decoded = Buffer.from(cleanContent, 'base64').toString('utf-8');
          return decoded;
        } catch (e) {
          this.logger.warn(`[PARSE] Failed to decode base64 content: ${e}`, 'InboundEmailService');
          return content;
        }
      } else if (encoding === '7bit' || encoding === '8bit' || encoding === 'binary' || !encoding) {
        // No decoding needed for 7bit, 8bit, binary, or no encoding specified
        return content;
      } else {
        // Unknown encoding - log warning but return as-is
        this.logger.warn(`[PARSE] Unknown Content-Transfer-Encoding: ${encoding}, returning content as-is`, 'InboundEmailService');
        return content;
      }
    } catch (e) {
      this.logger.error(`[PARSE] Error decoding content with encoding ${encoding}: ${e}`, 'InboundEmailService');
      return content;
    }
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
    console.log(`[PROCESS] ===== PROCESS INBOUND EMAIL START =====`);
    console.log(`[PROCESS] Email ID: ${email.id}, from: ${email.from}, to: ${email.to}`);
    this.logger.log(`[PROCESS] ===== PROCESS INBOUND EMAIL START =====`, 'InboundEmailService');
    this.logger.log(`[PROCESS] Email ID: ${email.id}, from: ${email.from}, to: ${email.to}`, 'InboundEmailService');

    try {
      // Mark as processed
      console.log(`[PROCESS] Marking email as processed...`);
      this.logger.log(`[PROCESS] Marking email as processed...`, 'InboundEmailService');
      email.status = 'processed';
      email.processedAt = new Date();
      await this.inboundEmailRepository.save(email);
      console.log(`[PROCESS] ✅ Email marked as processed`);
      this.logger.log(`[PROCESS] ✅ Email marked as processed`, 'InboundEmailService');

      // Deliver to all subscribed services via webhooks
      console.log(`[PROCESS] Delivering to subscribed services...`);
      this.logger.log(`[PROCESS] Delivering to subscribed services...`, 'InboundEmailService');
      await this.webhookDeliveryService.deliverToSubscriptions(email);
      console.log(`[PROCESS] ✅ Successfully processed inbound email ${email.id}`);
      this.logger.log(`[PROCESS] ✅ Successfully processed inbound email ${email.id}`, 'InboundEmailService');
      console.log(`[PROCESS] ===== PROCESS INBOUND EMAIL END (SUCCESS) =====`);
      this.logger.log(`[PROCESS] ===== PROCESS INBOUND EMAIL END (SUCCESS) =====`, 'InboundEmailService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[PROCESS] ❌ Failed to process inbound email ${email.id}: ${errorMessage}`, errorStack);
      this.logger.error(`[PROCESS] ❌ Failed to process inbound email ${email.id}: ${errorMessage}`, errorStack, 'InboundEmailService');
      
      console.log(`[PROCESS] Marking email as failed...`);
      this.logger.log(`[PROCESS] Marking email as failed...`, 'InboundEmailService');
      email.status = 'failed';
      email.error = errorMessage;
      await this.inboundEmailRepository.save(email);
      
      this.logger.log(`[PROCESS] ===== PROCESS INBOUND EMAIL END (ERROR) =====`, 'InboundEmailService');
      throw error;
    }
  }

  /**
   * Find inbound emails with filters
   */
  async findInboundEmails(filters: {
    limit?: number;
    toFilter?: string;
    excludeTo?: string[];
    status?: string;
  }): Promise<any[]> {
    const queryBuilder = this.inboundEmailRepository.createQueryBuilder('email');

    // Filter by status
    if (filters.status) {
      queryBuilder.where('email.status = :status', { status: filters.status });
    }

    // Filter by 'to' email (LIKE pattern)
    if (filters.toFilter) {
      if (filters.status) {
        queryBuilder.andWhere('email.to LIKE :toFilter', { toFilter: `%${filters.toFilter}` });
      } else {
        queryBuilder.where('email.to LIKE :toFilter', { toFilter: `%${filters.toFilter}` });
      }
    }

    // Exclude specific 'to' addresses
    if (filters.excludeTo && filters.excludeTo.length > 0) {
      queryBuilder.andWhere('email.to NOT IN (:...excludeTo)', { excludeTo: filters.excludeTo });
    }

    // Order by receivedAt descending
    queryBuilder.orderBy('email.receivedAt', 'DESC');

    // Limit results
    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    const emails = await queryBuilder.getMany();

    // Format response to match webhook payload format
    return emails.map((email) => ({
      id: email.id,
      from: email.from,
      to: email.to,
      subject: email.subject || 'Email ticket',
      bodyText: email.bodyText || '',
      bodyHtml: email.bodyHtml || null,
      attachments: email.attachments || [],
      receivedAt: email.receivedAt,
      messageId: email.rawData?.mail?.messageId || `inbound-${email.id}`,
      status: email.status,
    }));
  }

}
