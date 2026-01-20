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
import { EmailService } from './email.service';

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
    // Use any here to stay compatible with full SES payload without over-typing
    // commonHeaders contains already decoded subject which we can trust for encoding
    commonHeaders?: any;
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

export interface ParsedEmailAttachment {
  filename: string;
  contentType: string;
  content: string; // Raw string content from email parsing
}

export interface InboundEmailSummary {
  id: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  attachments: ParsedEmailAttachment[];
  receivedAt: Date;
  messageId: string;
  status: string;
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
    private emailService: EmailService,
  ) {}

  /**
   * Handle SNS notification (subscription confirmation or email notification)
   */
  async handleSNSNotification(snsMessage: SNSMessage): Promise<void> {
    this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION START =====`, 'InboundEmailService');
    this.logger.log(`[SERVICE] SNS notification type: ${snsMessage.Type}`, 'InboundEmailService');
    this.logger.log(`[SERVICE] MessageId: ${snsMessage.MessageId}`, 'InboundEmailService');
    this.logger.log(`[SERVICE] TopicArn: ${snsMessage.TopicArn}`, 'InboundEmailService');
    this.logger.log(`[SERVICE] Has Message field: ${!!snsMessage.Message}, Message length: ${snsMessage.Message?.length || 0}`, 'InboundEmailService');

    if (snsMessage.Type === 'SubscriptionConfirmation') {
      this.logger.log(`[SERVICE] SubscriptionConfirmation - handled by controller, skipping`, 'InboundEmailService');
      this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION END =====`, 'InboundEmailService');
      return;
    }

    if (snsMessage.Type === 'Notification' && snsMessage.Message) {
      this.logger.log(`[SERVICE] Processing Notification with Message field`, 'InboundEmailService');
      try {
        // Parse SES notification from SNS Message field (JSON string)
        this.logger.log(`[SERVICE] Parsing Message field as JSON...`, 'InboundEmailService');
        const sesNotification: SESNotification = JSON.parse(snsMessage.Message);
        this.logger.log(`[SERVICE] ✅ Parsed SES notification successfully`, 'InboundEmailService');
        this.logger.log(`[SERVICE] SES notification - source: ${sesNotification.mail?.source}, destination: ${JSON.stringify(sesNotification.mail?.destination)}, messageId: ${sesNotification.mail?.messageId}`, 'InboundEmailService');
        
        this.logger.log(`[SERVICE] Calling parseEmailContent...`, 'InboundEmailService');
        const inboundEmail = await this.parseEmailContent(sesNotification);
        this.logger.log(`[SERVICE] ✅ Parsed email content, email ID: ${inboundEmail.id || 'NEW'}, from: ${inboundEmail.from}, to: ${inboundEmail.to}`, 'InboundEmailService');
        
        this.logger.log(`[SERVICE] Calling storeInboundEmail...`, 'InboundEmailService');
        await this.storeInboundEmail(inboundEmail);
        this.logger.log(`[SERVICE] ✅ Stored inbound email, ID: ${inboundEmail.id}`, 'InboundEmailService');
        
        this.logger.log(`[SERVICE] Calling processInboundEmail...`, 'InboundEmailService');
        await this.processInboundEmail(inboundEmail);
        this.logger.log(`[SERVICE] ✅ Processed inbound email successfully`, 'InboundEmailService');
        this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION END (SUCCESS) =====`, 'InboundEmailService');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`[SERVICE] ❌ Failed to process SNS notification: ${errorMessage}`, errorStack, 'InboundEmailService');
        this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION END (ERROR) =====`, 'InboundEmailService');
        throw error;
      }
    } else {
      this.logger.warn(`[SERVICE] ⚠️ Unknown SNS message type or missing Message field: Type=${snsMessage.Type}, HasMessage=${!!snsMessage.Message}`, 'InboundEmailService');
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
      
      // Extract From header from email content if available (more accurate than SES source)
      let from = sesNotification.mail.source;
      const fromHeaderMatch = emailContent.match(/^From:\s*(.+)$/im);
      if (fromHeaderMatch) {
        const fromHeader = this.decodeHeader(fromHeaderMatch[1].trim());
        // Extract email address from "Name <email@domain.com>" or just "email@domain.com"
        const emailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          from = emailMatch[1];
          this.logger.log(`[PARSE] Extracted From header: ${from}`, 'InboundEmailService');
        }
      }
      
      // Decode email addresses (may contain quoted-printable sequences)
      from = this.decodeEmailAddress(from);
      const toRaw = sesNotification.mail.destination[0] || sesNotification.receipt.recipients[0] || '';
      const to = this.decodeEmailAddress(toRaw);
      
      // Prefer subject from parsed email parts, but fall back to SES commonHeaders.subject
      // SES already provides correctly decoded subject, so we also use it to fix encoding mismatches
      let subject = emailParts.subject || null;
      const sesSubject =
        (sesNotification as any).mail &&
        (sesNotification as any).mail.commonHeaders &&
        (sesNotification as any).mail.commonHeaders.subject;
      if (sesSubject) {
        if (!subject) {
          subject = sesSubject;
          this.logger.log(
            `[PARSE] Using SES commonHeaders.subject as subject: ${subject}`,
            'InboundEmailService',
          );
        } else if (subject !== sesSubject) {
          this.logger.log(
            `[PARSE] Subject mismatch detected, replacing parsed subject with SES commonHeaders.subject to avoid encoding issues. Parsed: ${subject}, SES: ${sesSubject}`,
            'InboundEmailService',
          );
          subject = sesSubject;
        }
      }

      const bodyText = emailParts.bodyText || '';
      let bodyHtml = emailParts.bodyHtml || null;
      const attachments = emailParts.attachments || [];

      // For plain-text emails, generate a simple HTML body that preserves line breaks.
      // This ensures that ticket view in helpdesk shows readable paragraphs instead of a single long line.
      if (!bodyHtml && bodyText) {
        bodyHtml = bodyText.replace(/\r\n|\r|\n/g, '<br>');
        this.logger.log(
          `[PARSE] Generated HTML body from plain text to preserve line breaks (length: ${bodyHtml.length})`,
          'InboundEmailService',
        );
      }

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
    attachments: ParsedEmailAttachment[];
  } {
    const parts = {
      subject: null as string | null,
      bodyText: '',
      bodyHtml: null as string | null,
      attachments: [] as ParsedEmailAttachment[],
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

    // Extract subject from headers (handle multi-line headers)
    // RFC 2047 allows headers to be split across multiple lines
    // Continuation lines start with whitespace (space or tab)
    const subjectLines: string[] = [];
    const headerLines = headers.split(/\r?\n/);
    let inSubject = false;
    for (let i = 0; i < headerLines.length; i++) {
      const line = headerLines[i];
      if (line.match(/^Subject:\s*(.+)$/i)) {
        // Start of Subject header
        const match = line.match(/^Subject:\s*(.+)$/i);
        if (match) {
          subjectLines.push(match[1]);
          inSubject = true;
        }
      } else if (inSubject && /^\s/.test(line)) {
        // Continuation line (starts with whitespace)
        subjectLines.push(line.trim());
      } else if (inSubject && line.trim() === '') {
        // Empty line - end of headers
        break;
      } else if (inSubject && /^[A-Za-z-]+:/.test(line)) {
        // Next header starts - end of Subject
        break;
      } else if (inSubject) {
        // Unexpected line, but might be part of subject if it doesn't look like a header
        // Only continue if line doesn't look like a new header
        if (!/^[A-Za-z-]+:\s*/.test(line)) {
          subjectLines.push(line.trim());
        } else {
          break;
        }
      }
    }

    if (subjectLines.length > 0) {
      // Join all subject lines and decode
      const subjectRaw = subjectLines.join(' ').trim();
      // Decode the header
      parts.subject = this.decodeHeader(subjectRaw);
      this.logger.log(`[PARSE] Extracted subject (raw length: ${subjectRaw.length}, decoded length: ${parts.subject?.length || 0})`, 'InboundEmailService');
      if (subjectRaw.length > 100 || (parts.subject && parts.subject.length > 100)) {
        this.logger.log(`[PARSE] Subject preview (raw): ${subjectRaw.substring(0, 100)}..., decoded: ${parts.subject?.substring(0, 100)}...`, 'InboundEmailService');
      } else {
        this.logger.log(`[PARSE] Subject (raw): ${subjectRaw}, decoded: ${parts.subject}`, 'InboundEmailService');
      }
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
   * Handles RFC 2047 encoded headers: =?charset?encoding?text?=
   * Also handles multi-line encoded headers and proper charset conversion
   */
  private decodeHeader(header: string): string {
    if (!header) {
      return header;
    }

    let decoded = header;

    // Handle RFC 2047 encoded headers: =?charset?encoding?text?=
    // This can span multiple encoded segments and may be split across lines
    // Pattern: =?charset?encoding?text?= (with optional whitespace between segments)
    decoded = decoded.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/gi, (match, charset, encoding, text) => {
      try {
        const encodingUpper = encoding.toUpperCase();
        const charsetLower = (charset || 'utf-8').toLowerCase().trim();

        if (encodingUpper === 'B') {
          // Base64 encoding
          const buffer = Buffer.from(text.replace(/\s/g, ''), 'base64');
          // Try to decode with specified charset, fallback to utf-8
          try {
            return buffer.toString(charsetLower as BufferEncoding);
          } catch (e) {
            // If charset conversion fails, try utf-8
            this.logger.warn(`[PARSE] Failed to decode base64 with charset ${charsetLower}, trying utf-8: ${e}`, 'InboundEmailService');
            return buffer.toString('utf-8');
          }
        } else if (encodingUpper === 'Q') {
          // Quoted-printable encoding
          // Replace =XX with actual character, handle underscore as space
          const decodedText = text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (m, hex) => {
            const charCode = parseInt(hex, 16);
            return String.fromCharCode(charCode);
          });

          // Convert from specified charset to UTF-8
          try {
            const buffer = Buffer.from(decodedText, charsetLower as BufferEncoding);
            return buffer.toString('utf-8');
          } catch (e) {
            // If charset conversion fails, return as-is (might already be UTF-8)
            this.logger.warn(`[PARSE] Failed to convert quoted-printable from charset ${charsetLower}, using as-is: ${e}`, 'InboundEmailService');
            return decodedText;
          }
        }
        return text;
      } catch (error) {
        this.logger.warn(`[PARSE] Failed to decode header segment: ${match}, error: ${error}`, 'InboundEmailService');
        return match; // Return original if decoding fails
      }
    });

    // If no RFC 2047 encoding found, check if header might be incorrectly encoded
    // Some emails have UTF-8 bytes interpreted as ISO-8859-1
    // Try to detect and fix common encoding issues
    if (decoded === header && /[\x80-\xFF]/.test(decoded)) {
      // Contains high-byte characters, might be encoding issue
      try {
        // Try to interpret as ISO-8859-1 and convert to UTF-8
        const buffer = Buffer.from(decoded, 'latin1');
        const utf8Decoded = buffer.toString('utf-8');
        // Check if result looks more valid (contains fewer replacement characters)
        if (utf8Decoded && !utf8Decoded.includes('\uFFFD')) {
          this.logger.log(`[PARSE] Fixed encoding issue in header (latin1->utf8): ${decoded.substring(0, 50)} -> ${utf8Decoded.substring(0, 50)}`, 'InboundEmailService');
          decoded = utf8Decoded;
        }
      } catch (e) {
        // Ignore conversion errors, use original
      }
    }

    return decoded;
  }

  /**
   * Decode email address that may contain quoted-printable sequences
   * Handles cases like: SRS0=ZQ05=7Y=news.asourcingic.com=rachel@srs.websupport.sk
   * Where =ZQ05=7Y= should be decoded to actual characters
   */
  private decodeEmailAddress(email: string): string {
    if (!email) {
      return email;
    }

    // Check if email contains quoted-printable sequences (=XX where XX is hex)
    // Pattern: = followed by exactly 2 hex digits (0-9A-F)
    if (!email.match(/=[0-9A-F]{2}/i)) {
      // No quoted-printable sequences, return as-is
      return email;
    }

    try {
      // Decode quoted-printable sequences in email address
      // Replace =XX with the actual character
      let decoded = email.replace(/=([0-9A-F]{2})/gi, (match, hex) => {
        const charCode = parseInt(hex, 16);
        return String.fromCharCode(charCode);
      });

      // Also handle RFC 2047 encoded addresses (less common but possible)
      decoded = this.decodeHeader(decoded);

      this.logger.log(`[PARSE] Decoded email address: ${email} -> ${decoded}`, 'InboundEmailService');
      return decoded;
    } catch (error) {
      // If decoding fails, return original
      this.logger.warn(`[PARSE] Failed to decode email address ${email}: ${error}`, 'InboundEmailService');
      return email;
    }
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
        const processed = content
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
    this.logger.log(`[STORE] ===== STORE INBOUND EMAIL START =====`, 'InboundEmailService');
    this.logger.log(`[STORE] Email data - from: ${email.from}, to: ${email.to}, subject: ${email.subject}`, 'InboundEmailService');
    this.logger.log(`[STORE] Status: ${email.status}, has rawData: ${!!email.rawData}`, 'InboundEmailService');
    
    try {
      this.logger.log(`[STORE] Saving to database...`, 'InboundEmailService');
      await this.inboundEmailRepository.save(email);
      this.logger.log(`[STORE] ✅ Stored inbound email successfully - ID: ${email.id}, from: ${email.from}`, 'InboundEmailService');
      this.logger.log(`[STORE] ===== STORE INBOUND EMAIL END (SUCCESS) =====`, 'InboundEmailService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
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

      // Check and forward email if forwarding rule exists
      await this.forwardEmailIfNeeded(email);

      // Deliver to all subscribed services via webhooks
      this.logger.log(`[PROCESS] Delivering to subscribed services...`, 'InboundEmailService');
      await this.webhookDeliveryService.deliverToSubscriptions(email);
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
   * Get email forwarding rules from environment variable
   * Format: JSON object like {"stashok@speakasap.com": "ssfskype@gmail.com"}
   */
  private getForwardingRules(): Record<string, string> {
    const forwardingRulesEnv = process.env.EMAIL_FORWARDING_RULES;
    if (!forwardingRulesEnv) {
      return {};
    }

    try {
      const rules = JSON.parse(forwardingRulesEnv);
      if (typeof rules !== 'object' || Array.isArray(rules)) {
        this.logger.warn(`[FORWARD] Invalid EMAIL_FORWARDING_RULES format, expected object`, 'InboundEmailService');
        return {};
      }
      return rules;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[FORWARD] Failed to parse EMAIL_FORWARDING_RULES: ${errorMessage}`, undefined, 'InboundEmailService');
      return {};
    }
  }

  /**
   * Forward email if forwarding rule exists for the recipient
   */
  private async forwardEmailIfNeeded(email: InboundEmail): Promise<void> {
    const forwardingRules = this.getForwardingRules();
    const forwardTo = forwardingRules[email.to];

    if (!forwardTo) {
      return; // No forwarding rule for this recipient
    }

    this.logger.log(`[FORWARD] Forwarding email from ${email.to} to ${forwardTo}`, 'InboundEmailService');

    try {
      // Prepare forwarded email subject
      const forwardedSubject = email.subject
        ? `Fwd: ${email.subject}`
        : 'Fwd: (no subject)';

      // Prepare forwarded email body
      const forwardedBody = this.prepareForwardedEmailBody(email);

      // Send forwarded email
      await this.emailService.send({
        to: forwardTo,
        subject: forwardedSubject,
        message: forwardedBody,
        contentType: 'text/html',
        emailProvider: 'auto', // Use auto provider selection
      });

      this.logger.log(`[FORWARD] ✅ Successfully forwarded email from ${email.to} to ${forwardTo}`, 'InboundEmailService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[FORWARD] ❌ Failed to forward email from ${email.to} to ${forwardTo}: ${errorMessage}`, errorStack, 'InboundEmailService');
      // Don't throw - forwarding failure shouldn't break email processing
    }
  }

  /**
   * Prepare HTML body for forwarded email
   */
  private prepareForwardedEmailBody(email: InboundEmail): string {
    const from = email.from || 'unknown@speakasap.com';
    const to = email.to || 'unknown@speakasap.com';
    const subject = email.subject || '(no subject)';
    const receivedAt = email.receivedAt ? email.receivedAt.toISOString() : new Date().toISOString();

    // Use HTML body if available, otherwise use text body
    const emailBody = email.bodyHtml || email.bodyText || '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .forward-header { background-color: #f5f5f5; padding: 15px; border-left: 4px solid #007bff; margin-bottom: 20px; }
    .forward-header p { margin: 5px 0; }
    .forward-label { font-weight: bold; color: #666; }
    .email-body { padding: 15px; background-color: #fafafa; border: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="forward-header">
    <p><span class="forward-label">From:</span> ${this.escapeHtml(from)}</p>
    <p><span class="forward-label">To:</span> ${this.escapeHtml(to)}</p>
    <p><span class="forward-label">Subject:</span> ${this.escapeHtml(subject)}</p>
    <p><span class="forward-label">Date:</span> ${this.escapeHtml(receivedAt)}</p>
  </div>
  <div class="email-body">
    ${emailBody}
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Find inbound emails with filters
   */
  async findInboundEmails(filters: {
    limit?: number;
    toFilter?: string;
    excludeTo?: string[];
    status?: string;
  }): Promise<InboundEmailSummary[]> {
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
