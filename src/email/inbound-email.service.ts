/**
 * Inbound Email Service
 * Handles inbound emails received via AWS SES SNS webhook
 */

import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
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
  notificationType?: string; // "Received" for inbound emails (present in raw format)
  // Subscription confirmation fields (for raw format SNS subscription confirmations)
  Type?: string; // "SubscriptionConfirmation" for SNS subscription confirmations
  SubscribeURL?: string; // URL to confirm SNS subscription
  Token?: string; // Token for SNS subscription confirmation
  // Email notification fields
  mail?: {
    source: string;
    destination: string[];
    messageId: string;
    timestamp: string;
    // commonHeaders contains already decoded subject which we can trust for encoding
    commonHeaders?: {
      subject?: string;
      [key: string]: unknown; // Allow other headers without over-typing
    };
    headers?: Array<{ name: string; value: string }>; // Original headers array
    headersTruncated?: boolean;
  };
  receipt?: {
    recipients: string[];
    timestamp?: string;
    processingTimeMillis?: number;
    spamVerdict?: { status: string };
    virusVerdict?: { status: string };
    spfVerdict?: { status: string };
    dkimVerdict?: { status: string };
    dmarcVerdict?: { status: string };
    action?: {
      type: string;
      bucketName?: string;
      objectKey?: string;
      objectKeyPrefix?: string;
      topicArn?: string;
      encoding?: string;
    };
  };
  content?: string; // Base64 encoded email content (optional - may be in S3)
  [key: string]: unknown; // Allow additional fields from AWS SES
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
  private s3Client: S3Client;
  private defaultS3Bucket: string | undefined;
  private defaultS3Prefix: string | undefined;

  constructor(
    @InjectRepository(InboundEmail)
    private inboundEmailRepository: Repository<InboundEmail>,
    @Inject(LoggerService)
    private logger: LoggerService,
    private httpService: HttpService,
    private webhookDeliveryService: WebhookDeliveryService,
    private emailService: EmailService,
  ) {
    // Initialize S3 client for fetching emails stored in S3
    const awsRegion = process.env.AWS_SES_REGION || 'eu-central-1';
    this.s3Client = new S3Client({
      region: awsRegion,
      credentials: process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
          }
        : undefined, // Will use default AWS credentials if not provided
    });

    // Store default S3 bucket configuration (fallback if not in notification)
    this.defaultS3Bucket = process.env.AWS_SES_S3_BUCKET;
    this.defaultS3Prefix = process.env.AWS_SES_S3_OBJECT_KEY_PREFIX;
    if (this.defaultS3Bucket) {
      this.logger.log(`[SERVICE] Configured default S3 bucket: ${this.defaultS3Bucket}, prefix: ${this.defaultS3Prefix || 'none'}`, 'InboundEmailService');
    }
  }

  /**
   * Handle SES notification directly (raw message delivery format)
   * Body is the SES notification directly, no SNS wrapper
   */
  async handleSESNotification(sesNotification: SESNotification): Promise<void> {
    this.logger.log(`[SERVICE] ===== HANDLE SES NOTIFICATION (RAW) START =====`, 'InboundEmailService');
    this.logger.log(`[SERVICE] SES notification - source: ${sesNotification.mail?.source}, destination: ${JSON.stringify(sesNotification.mail?.destination)}, messageId: ${sesNotification.mail?.messageId}`, 'InboundEmailService');

    try {
      this.logger.log(`[SERVICE] Calling parseEmailContent...`, 'InboundEmailService');
      const inboundEmail = await this.parseEmailContent(sesNotification);
      this.logger.log(`[SERVICE] ✅ Parsed email content, email ID: ${inboundEmail.id || 'NEW'}, from: ${inboundEmail.from}, to: ${inboundEmail.to}`, 'InboundEmailService');

      this.logger.log(`[SERVICE] Calling storeInboundEmail...`, 'InboundEmailService');
      await this.storeInboundEmail(inboundEmail);
      this.logger.log(`[SERVICE] ✅ Stored inbound email, ID: ${inboundEmail.id}`, 'InboundEmailService');

      this.logger.log(`[SERVICE] Calling processInboundEmail...`, 'InboundEmailService');
      await this.processInboundEmail(inboundEmail);
      this.logger.log(`[SERVICE] ✅ Processed inbound email successfully`, 'InboundEmailService');
      this.logger.log(`[SERVICE] ===== HANDLE SES NOTIFICATION (RAW) END (SUCCESS) =====`, 'InboundEmailService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[SERVICE] ❌ Failed to process SES notification (raw): ${errorMessage}`, errorStack, 'InboundEmailService');
      this.logger.log(`[SERVICE] ===== HANDLE SES NOTIFICATION (RAW) END (ERROR) =====`, 'InboundEmailService');
      throw error;
    }
  }

  /**
   * Handle SNS notification (wrapped format - raw delivery disabled)
   * Body has SNS wrapper with Message field containing SES notification as JSON string
   */
  async handleSNSNotification(snsMessage: SNSMessage): Promise<void> {
    this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION (WRAPPED) START =====`, 'InboundEmailService');
    this.logger.log(`[SERVICE] SNS notification type: ${snsMessage.Type}`, 'InboundEmailService');
    this.logger.log(`[SERVICE] MessageId: ${snsMessage.MessageId}`, 'InboundEmailService');
    this.logger.log(`[SERVICE] TopicArn: ${snsMessage.TopicArn}`, 'InboundEmailService');
    this.logger.log(`[SERVICE] Has Message field: ${!!snsMessage.Message}, Message length: ${snsMessage.Message?.length || 0}`, 'InboundEmailService');

    if (snsMessage.Type === 'SubscriptionConfirmation') {
      this.logger.log(`[SERVICE] SubscriptionConfirmation - handled by controller, skipping`, 'InboundEmailService');
      this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION (WRAPPED) END =====`, 'InboundEmailService');
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

        // Use the same processing logic as raw format
        await this.handleSESNotification(sesNotification);
        this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION (WRAPPED) END (SUCCESS) =====`, 'InboundEmailService');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`[SERVICE] ❌ Failed to process SNS notification: ${errorMessage}`, errorStack, 'InboundEmailService');
        this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION (WRAPPED) END (ERROR) =====`, 'InboundEmailService');
        throw error;
      }
    } else {
      this.logger.warn(`[SERVICE] ⚠️ Unknown SNS message type or missing Message field: Type=${snsMessage.Type}, HasMessage=${!!snsMessage.Message}`, 'InboundEmailService');
      this.logger.log(`[SERVICE] ===== HANDLE SNS NOTIFICATION (WRAPPED) END (IGNORED) =====`, 'InboundEmailService');
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
   * Fetch email content from S3 if stored there
   */
  private async fetchEmailFromS3(bucketName: string, objectKey: string): Promise<string> {
    this.logger.log(`[S3] Fetching email from S3: bucket=${bucketName}, key=${objectKey}`, 'InboundEmailService');
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      const response = await this.s3Client.send(command);
      if (!response.Body) {
        throw new Error('S3 object body is empty');
      }
      const emailContent = await response.Body.transformToString();
      this.logger.log(`[S3] ✅ Fetched email from S3, length: ${emailContent.length}`, 'InboundEmailService');
      return emailContent;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[S3] ❌ Failed to fetch email from S3: ${errorMessage}`, undefined, 'InboundEmailService');
      throw new Error(`Failed to fetch email from S3: ${errorMessage}`);
    }
  }

  /**
   * Parse email content from SES notification
   * Public method for re-parsing emails
   */
  async parseEmailContent(sesNotification: SESNotification): Promise<InboundEmail> {
    this.logger.log(`[PARSE] ===== PARSE EMAIL CONTENT START =====`, 'InboundEmailService');
    this.logger.log(`[PARSE] SES messageId: ${sesNotification.mail.messageId}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Source: ${sesNotification.mail.source}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Destination: ${JSON.stringify(sesNotification.mail.destination)}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Content length (base64): ${sesNotification.content?.length || 0}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Receipt action type: ${sesNotification.receipt?.action?.type || 'N/A'}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Receipt action bucketName: ${sesNotification.receipt?.action?.bucketName || 'N/A'}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Receipt action objectKey: ${sesNotification.receipt?.action?.objectKey || 'N/A'}`, 'InboundEmailService');
    this.logger.log(`[PARSE] Receipt action objectKeyPrefix: ${sesNotification.receipt?.action?.objectKeyPrefix || 'N/A'}`, 'InboundEmailService');

    try {
      let emailContent: string;

      // Check if email content is in notification or needs to be fetched from S3
      // When both S3 and SNS actions are configured, content may be in S3 even if action type is 'SNS'
      // For emails > 150 KB, AWS SES stores content in S3 and may not include it in SNS notification
      // Strategy: Always prefer fetching from S3 if bucket is known (from notification or config)
      // This ensures we get the full email with attachments even for large emails
      
      const bucketNameFromNotification = sesNotification.receipt?.action?.bucketName;
      const bucketName = bucketNameFromNotification || this.defaultS3Bucket;
      
      if (sesNotification.content && (!bucketName || sesNotification.content.length < 100000)) {
        // Email content is in notification and it's small enough (< 100 KB)
        // Use content from notification for small emails (faster)
        this.logger.log(`[PARSE] Email content found in notification, decoding base64...`, 'InboundEmailService');
        emailContent = Buffer.from(sesNotification.content, 'base64').toString('utf-8');
        this.logger.log(`[PARSE] ✅ Decoded content from notification, length: ${emailContent.length}`, 'InboundEmailService');
      } else if (bucketName) {
        // Email is stored in S3 (or we have default bucket configured)
        // Always fetch from S3 to ensure we get full email with attachments
        let objectKey = sesNotification.receipt?.action?.objectKey;
        const objectKeyPrefix = sesNotification.receipt?.action?.objectKeyPrefix || this.defaultS3Prefix;
        
        // Construct object key if not provided
        // AWS SES stores emails with objectKey in receipt.action when email is stored in S3
        // If objectKey is missing, try to construct it (though this is uncommon)
        // Note: AWS SES typically includes objectKey in receipt.action, so this is a fallback
        if (!objectKey && sesNotification.mail.messageId) {
          // Try constructing from prefix + messageId (AWS SES might use this format)
          if (objectKeyPrefix) {
            // Try: {prefix}{messageId}
            objectKey = `${objectKeyPrefix}${sesNotification.mail.messageId}`;
            this.logger.log(`[PARSE] Constructed S3 object key from prefix+messageId: ${objectKey}`, 'InboundEmailService');
          } else {
            // Try messageId directly (less common)
            objectKey = sesNotification.mail.messageId;
            this.logger.log(`[PARSE] No prefix configured, trying messageId as key: ${objectKey}`, 'InboundEmailService');
          }
        }
        
        // Log if we still don't have objectKey
        if (!objectKey) {
          this.logger.warn(`[PARSE] ⚠️ Cannot construct S3 object key: missing messageId and objectKey not in notification`, 'InboundEmailService');
        }
        
        if (objectKey) {
          this.logger.log(`[PARSE] Fetching email from S3 (content not in notification or using S3-first strategy)...`, 'InboundEmailService');
          this.logger.log(`[PARSE] S3 bucket: ${bucketName}, key: ${objectKey}`, 'InboundEmailService');
          try {
            emailContent = await this.fetchEmailFromS3(bucketName, objectKey);
          } catch (s3Error: unknown) {
            const s3ErrorMessage = s3Error instanceof Error ? s3Error.message : 'Unknown error';
            // If S3 fetch fails and we have content in notification, fall back to notification
            if (sesNotification.content) {
              this.logger.warn(`[PARSE] S3 fetch failed (${s3ErrorMessage}), falling back to notification content`, 'InboundEmailService');
              emailContent = Buffer.from(sesNotification.content, 'base64').toString('utf-8');
            } else {
              throw s3Error;
            }
          }
        } else {
          // No objectKey available, try notification content as fallback
          if (sesNotification.content) {
            this.logger.warn(`[PARSE] S3 bucket configured but objectKey not available, using notification content`, 'InboundEmailService');
            emailContent = Buffer.from(sesNotification.content, 'base64').toString('utf-8');
          } else {
            throw new Error(`S3 bucket configured (${bucketName}) but objectKey not available and cannot be constructed`);
          }
        }
      } else if (sesNotification.content) {
        // Fallback: use notification content if available
        this.logger.log(`[PARSE] No S3 bucket configured, using notification content`, 'InboundEmailService');
        emailContent = Buffer.from(sesNotification.content, 'base64').toString('utf-8');
      } else {
        // No content available
        throw new Error('Email content not found in notification and S3 bucket not configured');
      }

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
      const sesSubject = sesNotification.mail.commonHeaders?.subject;
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

      // Validate parsed content - check if it looks corrupted (just punctuation, very short, or suspicious patterns)
      const looksCorrupted = bodyText && (
        bodyText.length < 10 ||
        /^[,\s!?.\-:;]+$/.test(bodyText.trim()) || // Only punctuation
        bodyText.includes('--Mail') && bodyText.length < 100 // Suspicious patterns
      );

      if (looksCorrupted && bodyText) {
        this.logger.warn(
          `[PARSE] ⚠️ Parsed bodyText looks corrupted (length: ${bodyText.length}, preview: ${bodyText.substring(0, 50)}). Raw MIME available in rawData.content for fallback.`,
          'InboundEmailService',
        );
      }

      // For plain-text emails, generate a simple HTML body that preserves line breaks.
      // This ensures that ticket view in helpdesk shows readable paragraphs instead of a single long line.
      if (!bodyHtml && bodyText && !looksCorrupted) {
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
          } else {
            // Detect attachments: check Content-Disposition or Content-Type
            const isAttachment = 
              // Explicit attachment disposition
              part.contentDisposition?.toLowerCase().includes('attachment') ||
              // Has filename in Content-Disposition (even if inline)
              (part.filename && part.contentDisposition?.toLowerCase().includes('filename')) ||
              // Content-Type indicates attachment (not text/plain, text/html, or multipart)
              (part.contentType && 
               !part.contentType.includes('text/plain') && 
               !part.contentType.includes('text/html') && 
               !part.contentType.includes('multipart') &&
               !part.contentType.includes('message/rfc822'));
            
            if (isAttachment) {
              parts.attachments.push({
                filename: part.filename || 'attachment',
                contentType: part.contentType || 'application/octet-stream',
                content: part.content,
              });
              this.logger.log(`[PARSE] Detected attachment: ${part.filename || 'attachment'} (${part.contentType || 'N/A'})`, 'InboundEmailService');
            }
          }
          // Note: Nested multipart messages are now handled recursively in parseMultipart itself,
          // so by the time we get here, all nested parts have already been flattened into the parts array
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

    // Escape boundary for regex (boundary may already include -- prefix from header)
    const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Multipart boundaries in body are prefixed with --, so match both --boundary and ----boundary (if boundary already has --)
    const boundaryPattern = `--${escapedBoundary}(?:--)?`;
    const boundaryRegex = new RegExp(boundaryPattern, 'g');
    
    // Split by boundary markers
    const sections = body.split(boundaryRegex);
    
    this.logger.log(`[PARSE] Split multipart into ${sections.length} sections using boundary pattern: ${boundaryPattern}`, 'InboundEmailService');

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      
      // Skip empty sections and the final closing boundary (ends with --)
      if (!section || section === '--' || section.endsWith('--')) {
        continue;
      }

      // Find header/body separator
      const headerBodySplit = section.indexOf('\r\n\r\n');
      if (headerBodySplit === -1) {
        // Try LF-only separator
        const headerBodySplitLF = section.indexOf('\n\n');
        if (headerBodySplitLF === -1) {
          this.logger.warn(`[PARSE] No header/body separator found in multipart section ${i}, skipping`, 'InboundEmailService');
          continue;
        }
        const partHeaders = section.substring(0, headerBodySplitLF);
        let partContent = section.substring(headerBodySplitLF + 2);
        
        // Clean up part content: remove trailing boundary markers and whitespace
        partContent = partContent.replace(/\r?\n--.*$/, '').trim();
        
      const contentTypeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
      const contentDispositionMatch = partHeaders.match(/Content-Disposition:\s*([^;\r\n]+)/i);
      const filenameMatch = partHeaders.match(/filename="?([^";\r\n]+)"?/i);
      const transferEncodingMatch = partHeaders.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);

      const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : undefined;
      
      // Check if this part is a nested multipart message
      if (contentType?.includes('multipart')) {
        // Extract boundary from Content-Type header
        const nestedBoundaryMatch = partHeaders.match(/boundary="?([^";\r\n]+)"?/i);
        if (nestedBoundaryMatch) {
          const nestedBoundary = nestedBoundaryMatch[1];
          this.logger.log(`[PARSE] Found nested multipart ${contentType} with boundary ${nestedBoundary}, recursively parsing...`, 'InboundEmailService');
          
          // Decode content first (if needed) before parsing nested multipart
          const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim().toLowerCase() : '';
          let decodedPartContent = partContent;
          if (transferEncoding) {
            const originalLength = partContent.length;
            decodedPartContent = this.decodeContent(partContent, transferEncoding);
            if (originalLength !== decodedPartContent.length) {
              this.logger.log(`[PARSE] Decoded ${transferEncoding} content in nested multipart part ${i}: ${originalLength} -> ${decodedPartContent.length} bytes`, 'InboundEmailService');
            }
          }
          
          // Recursively parse the nested multipart
          const nestedParts = this.parseMultipart(decodedPartContent, nestedBoundary);
          // Add all nested parts to the result
          parts.push(...nestedParts);
          continue;
        }
      }

      const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim().toLowerCase() : '';
      const originalLength = partContent.length;
      partContent = this.decodeContent(partContent, transferEncoding);
      
      if (transferEncoding && originalLength !== partContent.length) {
        this.logger.log(`[PARSE] Decoded ${transferEncoding} content in part ${i}: ${originalLength} -> ${partContent.length} bytes`, 'InboundEmailService');
      }

        parts.push({
          contentType: contentType,
          contentDisposition: contentDispositionMatch ? contentDispositionMatch[1].trim() : undefined,
          filename: filenameMatch ? this.decodeHeader(filenameMatch[1]) : undefined,
          content: partContent,
        });
        continue;
      }

      const partHeaders = section.substring(0, headerBodySplit);
      let partContent = section.substring(headerBodySplit + 4);

      // Clean up part content: remove trailing boundary markers, newlines, and whitespace
      // Boundary markers can appear at the end: \r\n--boundary or \n--boundary
      partContent = partContent.replace(/\r?\n--[^\r\n]*$/, '').trim();

      const contentTypeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
      const contentDispositionMatch = partHeaders.match(/Content-Disposition:\s*([^;\r\n]+)/i);
      const filenameMatch = partHeaders.match(/filename="?([^";\r\n]+)"?/i);
      const transferEncodingMatch = partHeaders.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);

      const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : undefined;
      
      // Check if this part is a nested multipart message
      if (contentType?.includes('multipart')) {
        // Extract boundary from Content-Type header
        const nestedBoundaryMatch = partHeaders.match(/boundary="?([^";\r\n]+)"?/i);
        if (nestedBoundaryMatch) {
          const nestedBoundary = nestedBoundaryMatch[1];
          this.logger.log(`[PARSE] Found nested multipart ${contentType} with boundary ${nestedBoundary}, recursively parsing...`, 'InboundEmailService');
          
          // Decode content first (if needed) before parsing nested multipart
          const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim().toLowerCase() : '';
          let decodedPartContent = partContent;
          if (transferEncoding) {
            const originalLength = partContent.length;
            decodedPartContent = this.decodeContent(partContent, transferEncoding);
            if (originalLength !== decodedPartContent.length) {
              this.logger.log(`[PARSE] Decoded ${transferEncoding} content in nested multipart part ${i}: ${originalLength} -> ${decodedPartContent.length} bytes`, 'InboundEmailService');
            }
          }
          
          // Recursively parse the nested multipart
          const nestedParts = this.parseMultipart(decodedPartContent, nestedBoundary);
          // Add all nested parts to the result
          parts.push(...nestedParts);
          continue;
        }
      }

      // Decode content based on Content-Transfer-Encoding
      const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim().toLowerCase() : '';
      const originalLength = partContent.length;
      partContent = this.decodeContent(partContent, transferEncoding);
      
      // Log decoding result for debugging
      if (transferEncoding && originalLength !== partContent.length) {
        this.logger.log(`[PARSE] Decoded ${transferEncoding} content in part ${i}: ${originalLength} -> ${partContent.length} bytes`, 'InboundEmailService');
      }

      // Only add parts that have content
      if (partContent) {
        parts.push({
          contentType: contentType,
          contentDisposition: contentDispositionMatch ? contentDispositionMatch[1].trim() : undefined,
          filename: filenameMatch ? this.decodeHeader(filenameMatch[1]) : undefined,
          content: partContent,
        });
        
        this.logger.log(`[PARSE] Extracted multipart part ${i}: contentType=${contentType || 'N/A'}, contentDisposition=${contentDispositionMatch?.[1] || 'N/A'}, contentLength=${partContent.length}`, 'InboundEmailService');
      }
    }

    this.logger.log(`[PARSE] Parsed ${parts.length} valid parts from multipart message`, 'InboundEmailService');
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
      // If we have the raw MIME content from SES, forward it unchanged via SES
      if (email.rawData?.content) {
        await this.emailService.send({
          to: forwardTo,
          subject: email.subject || '(no subject)',
          message: '', // Not used for raw
          rawMessage: email.rawData.content, // Base64-encoded raw MIME from SES
          emailProvider: 'ses',
        });

        this.logger.log(`[FORWARD] ✅ Successfully forwarded raw email from ${email.to} to ${forwardTo}`, 'InboundEmailService');
        return;
      }

      // Fallback: forward without modification using original body (no extra wrappers)
      const originalBody = email.bodyHtml || email.bodyText || '';
      await this.emailService.send({
        to: forwardTo,
        subject: email.subject || '(no subject)',
        message: originalBody,
        contentType: email.bodyHtml ? 'text/html' : 'text/plain',
        emailProvider: 'auto',
      });

      this.logger.log(`[FORWARD] ✅ Successfully forwarded email (fallback) from ${email.to} to ${forwardTo}`, 'InboundEmailService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[FORWARD] ❌ Failed to forward email from ${email.to} to ${forwardTo}: ${errorMessage}`, errorStack, 'InboundEmailService');
      // Don't throw - forwarding failure shouldn't break email processing
    }
  }

  /**
   * Re-parse email from rawData and update attachments
   */
  async reparseEmailFromRawData(emailId: string): Promise<{ attachmentsCount: number }> {
    this.logger.log(`[REPARSE] ===== REPARSE EMAIL START =====`, 'InboundEmailService');
    this.logger.log(`[REPARSE] Email ID: ${emailId}`, 'InboundEmailService');

    try {
      // Find the email
      const email = await this.inboundEmailRepository.findOne({
        where: { id: emailId },
      });

      if (!email) {
        throw new Error(`Email not found: ${emailId}`);
      }

      this.logger.log(`[REPARSE] Found email: ${email.from} -> ${email.to}, subject: ${email.subject}`, 'InboundEmailService');
      this.logger.log(`[REPARSE] Current attachments: ${email.attachments ? email.attachments.length : 0}`, 'InboundEmailService');

      // Check if rawData exists
      if (!email.rawData || !email.rawData.content) {
        throw new Error(`No rawData.content found for email ${emailId}`);
      }

      this.logger.log(`[REPARSE] Re-parsing email from rawData...`, 'InboundEmailService');

      // Re-parse the email using the updated code
      const sesNotification = email.rawData;
      const reParsedEmail = await this.parseEmailContent(sesNotification);

      this.logger.log(`[REPARSE] Re-parsed email - attachments: ${reParsedEmail.attachments ? reParsedEmail.attachments.length : 0}`, 'InboundEmailService');

      // Update the email in database with new attachments
      email.attachments = reParsedEmail.attachments && reParsedEmail.attachments.length > 0
        ? reParsedEmail.attachments
        : null;

      await this.inboundEmailRepository.save(email);

      this.logger.log(`[REPARSE] ✅ Updated email in database with ${email.attachments ? email.attachments.length : 0} attachments`, 'InboundEmailService');

      // Trigger webhook delivery again
      this.logger.log(`[REPARSE] Triggering webhook delivery...`, 'InboundEmailService');
      await this.webhookDeliveryService.deliverToSubscriptions(email);
      this.logger.log(`[REPARSE] ✅ Webhook delivery triggered`, 'InboundEmailService');

      this.logger.log(`[REPARSE] ===== REPARSE EMAIL END (SUCCESS) =====`, 'InboundEmailService');

      return {
        attachmentsCount: email.attachments ? email.attachments.length : 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[REPARSE] ❌ Failed to re-parse email: ${errorMessage}`, errorStack, 'InboundEmailService');
      this.logger.log(`[REPARSE] ===== REPARSE EMAIL END (ERROR) =====`, 'InboundEmailService');
      throw error;
    }
  }

  /**
   * Process email directly from S3 bucket
   * Used for S3 event notifications or manual processing
   */
  async processEmailFromS3(bucketName: string, objectKey: string): Promise<{ id: string; attachmentsCount: number }> {
    this.logger.log(`[S3_PROCESS] ===== PROCESS EMAIL FROM S3 START =====`, 'InboundEmailService');
    this.logger.log(`[S3_PROCESS] S3 bucket: ${bucketName}, key: ${objectKey}`, 'InboundEmailService');

    try {
      // Fetch email content from S3
      const emailContent = await this.fetchEmailFromS3(bucketName, objectKey);
      this.logger.log(`[S3_PROCESS] ✅ Fetched email from S3, length: ${emailContent.length}`, 'InboundEmailService');

      // Parse email headers to extract metadata
      const headerBodySplit = emailContent.indexOf('\r\n\r\n');
      if (headerBodySplit === -1) {
        const headerBodySplitLF = emailContent.indexOf('\n\n');
        if (headerBodySplitLF === -1) {
          throw new Error('Invalid email format: no header/body separator found');
        }
        const headers = emailContent.substring(0, headerBodySplitLF);
        const body = emailContent.substring(headerBodySplitLF + 2);
        return this.processEmailContentFromRaw(bucketName, objectKey, headers, body, emailContent);
      }

      const headers = emailContent.substring(0, headerBodySplit);
      const body = emailContent.substring(headerBodySplit + 4);
      return this.processEmailContentFromRaw(bucketName, objectKey, headers, body, emailContent);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[S3_PROCESS] ❌ Failed to process email from S3: ${errorMessage}`, errorStack, 'InboundEmailService');
      this.logger.log(`[S3_PROCESS] ===== PROCESS EMAIL FROM S3 END (ERROR) =====`, 'InboundEmailService');
      throw error;
    }
  }

  /**
   * Process email content from raw headers and body
   */
  private async processEmailContentFromRaw(
    bucketName: string,
    objectKey: string,
    headers: string,
    body: string,
    fullContent: string,
  ): Promise<{ id: string; attachmentsCount: number }> {
    const fromMatch = headers.match(/^From:\s*(.+)$/im);
    const toMatch = headers.match(/^To:\s*(.+)$/im);
    const subjectMatch = headers.match(/^Subject:\s*(.+)$/im);
    const messageIdMatch = headers.match(/^Message-Id:\s*(.+)$/im);
    const dateMatch = headers.match(/^Date:\s*(.+)$/im);

    const from = fromMatch ? this.decodeEmailAddress(this.decodeHeader(fromMatch[1].trim())) : 'unknown@unknown.com';
    const to = toMatch ? this.decodeEmailAddress(this.decodeHeader(toMatch[1].trim())) : 'unknown@unknown.com';
    const subject = subjectMatch ? this.decodeHeader(subjectMatch[1].trim()) : null;
    const messageId = messageIdMatch ? messageIdMatch[1].trim() : `s3-${Date.now()}`;
    const date = dateMatch ? dateMatch[1].trim() : new Date().toISOString();

    this.logger.log(`[S3_PROCESS] Parsed headers - from: ${from}, to: ${to}, subject: ${subject || 'N/A'}`, 'InboundEmailService');

    // Check if email already exists (by messageId)
    const existingEmails = await this.inboundEmailRepository.find({
      where: {},
    });
    const existingEmail = existingEmails.find(
      (e) => e.rawData?.mail?.messageId === messageId || e.rawData?.receipt?.action?.objectKey === objectKey,
    );

    if (existingEmail) {
      this.logger.log(`[S3_PROCESS] Email already exists with ID: ${existingEmail.id}, updating...`, 'InboundEmailService');
      // Re-parse to get updated attachments
      const emailParts = this.parseEmailParts(fullContent);
      existingEmail.attachments = emailParts.attachments.length > 0 ? emailParts.attachments : null;
      existingEmail.bodyText = emailParts.bodyText;
      existingEmail.bodyHtml = emailParts.bodyHtml;
      existingEmail.subject = emailParts.subject || subject;
      await this.inboundEmailRepository.save(existingEmail);
      await this.processInboundEmail(existingEmail);
      this.logger.log(`[S3_PROCESS] ✅ Updated existing email`, 'InboundEmailService');
      return { id: existingEmail.id, attachmentsCount: existingEmail.attachments ? existingEmail.attachments.length : 0 };
    }

    // Create a SESNotification-like object for parsing
    const sesNotification: SESNotification = {
      mail: {
        source: from,
        destination: [to],
        messageId: messageId,
        timestamp: date,
        commonHeaders: {
          subject: subject || undefined,
        },
      },
      receipt: {
        recipients: [to],
        action: {
          type: 'S3',
          bucketName: bucketName,
          objectKey: objectKey,
        },
      },
      content: undefined, // Content is in S3, not in notification
    };

    // Parse email content using existing method (but we already have the content)
    // We need to manually parse since parseEmailContent expects content or S3 fetch
    const emailParts = this.parseEmailParts(fullContent);

    const inboundEmail = new InboundEmail();
    inboundEmail.from = from;
    inboundEmail.to = to;
    inboundEmail.subject = emailParts.subject || subject;
    inboundEmail.bodyText = emailParts.bodyText || '';
    inboundEmail.bodyHtml = emailParts.bodyHtml || null;
    inboundEmail.attachments = emailParts.attachments.length > 0 ? emailParts.attachments : null;
    inboundEmail.status = 'pending';
    inboundEmail.rawData = {
      ...sesNotification,
      content: Buffer.from(fullContent).toString('base64'), // Store raw content as base64
    };

    // Store new email
    await this.storeInboundEmail(inboundEmail);
    this.logger.log(`[S3_PROCESS] ✅ Stored new email with ID: ${inboundEmail.id}`, 'InboundEmailService');

    // Process email (trigger webhooks)
    await this.processInboundEmail(inboundEmail);
    this.logger.log(`[S3_PROCESS] ✅ Processed email successfully`, 'InboundEmailService');

    this.logger.log(`[S3_PROCESS] ===== PROCESS EMAIL FROM S3 END (SUCCESS) =====`, 'InboundEmailService');
    return {
      id: inboundEmail.id,
      attachmentsCount: inboundEmail.attachments ? inboundEmail.attachments.length : 0,
    };
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
