/**
 * Webhook Delivery Service
 * Handles delivery of processed inbound emails to subscribed services via webhooks
 */

import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggerService } from '../../shared/logger/logger.service';
import { EmailService } from './email.service';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { WebhookDelivery, WebhookDeliveryStatus } from './entities/webhook-delivery.entity';
import { InboundEmail } from './entities/inbound-email.entity';
import { firstValueFrom } from 'rxjs';

/** Max delivery timeout cap (30 min). Doubling stops at this. */
const MAX_DELIVERY_TIMEOUT_MS = 30 * 60 * 1000;

export interface ProcessedEmailPayload {
  id: string;
  from: string;
  to: string;
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  attachments: EmailAttachment[];
  receivedAt: string;
  messageId: string;
  rawData?: any; // Full SES notification for advanced use cases
  rawContentBase64?: string; // Original MIME content from SES (base64, untouched)
  rawHeaders?: any[]; // Original headers array from SES (untouched)
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: string; // Base64 encoded
}

@Injectable()
export class WebhookDeliveryService {
  private readonly AUTO_RESUME_CHECK_INTERVAL_HOURS = 1;

  constructor(
    @InjectRepository(WebhookSubscription)
    private subscriptionRepository: Repository<WebhookSubscription>,
    @InjectRepository(InboundEmail)
    private inboundEmailRepository: Repository<InboundEmail>,
    @InjectRepository(WebhookDelivery)
    private webhookDeliveryRepository: Repository<WebhookDelivery>,
    @Inject(LoggerService)
    private logger: LoggerService,
    private httpService: HttpService,
    private emailService: EmailService,
  ) {}

  /**
   * Deliver processed email to all active subscriptions
   */
  async deliverToSubscriptions(inboundEmail: InboundEmail): Promise<void> {
    console.log(`[WEBHOOK_DELIVERY] ===== DELIVER TO SUBSCRIPTIONS START =====`);
    this.logger.log(`[WEBHOOK_DELIVERY] ===== DELIVER TO SUBSCRIPTIONS START =====`, 'WebhookDeliveryService');
    console.log(`[WEBHOOK_DELIVERY] Email ID: ${inboundEmail.id}, from: ${inboundEmail.from}, to: ${inboundEmail.to}`);
    this.logger.log(`[WEBHOOK_DELIVERY] Email ID: ${inboundEmail.id}, from: ${inboundEmail.from}, to: ${inboundEmail.to}`, 'WebhookDeliveryService');
    this.logger.log(`[WEBHOOK_DELIVERY] Email subject: ${inboundEmail.subject || 'N/A'}, receivedAt: ${inboundEmail.receivedAt.toISOString()}`, 'WebhookDeliveryService');
    this.logger.log(`[WEBHOOK_DELIVERY] Email has ${inboundEmail.attachments?.length || 0} attachments, bodyText length: ${inboundEmail.bodyText?.length || 0}, bodyHtml length: ${inboundEmail.bodyHtml?.length || 0}`, 'WebhookDeliveryService');

    try {
      // Get all active subscriptions
      this.logger.log(`[WEBHOOK_DELIVERY] Querying database for active subscriptions...`, 'WebhookDeliveryService');
      const subscriptions = await this.subscriptionRepository.find({
        where: { status: 'active' },
      });

      console.log(`[WEBHOOK_DELIVERY] Found ${subscriptions.length} active subscriptions`);
      this.logger.log(`[WEBHOOK_DELIVERY] Found ${subscriptions.length} active subscriptions`, 'WebhookDeliveryService');
      if (subscriptions.length > 0) {
        this.logger.log(`[WEBHOOK_DELIVERY] Subscription services: ${subscriptions.map(s => s.serviceName).join(', ')}`, 'WebhookDeliveryService');
      }

      if (subscriptions.length === 0) {
        console.log(`[WEBHOOK_DELIVERY] No active subscriptions, skipping delivery`);
        this.logger.log(`[WEBHOOK_DELIVERY] No active subscriptions, skipping delivery`, 'WebhookDeliveryService');
        this.logger.log(`[WEBHOOK_DELIVERY] ===== DELIVER TO SUBSCRIPTIONS END (NO SUBSCRIPTIONS) =====`, 'WebhookDeliveryService');
        return;
      }

      // Prepare standardized email payload
      this.logger.log(`[WEBHOOK_DELIVERY] Starting payload preparation for email ID: ${inboundEmail.id}`, 'WebhookDeliveryService');
      const payload = await this.prepareEmailPayload(inboundEmail);
      console.log(`[WEBHOOK_DELIVERY] ✅ Prepared email payload - subject: ${payload.subject}, attachments: ${payload.attachments.length}`);
      this.logger.log(`[WEBHOOK_DELIVERY] ✅ Prepared email payload - subject: ${payload.subject}, attachments: ${payload.attachments.length}`, 'WebhookDeliveryService');
      this.logger.log(`[WEBHOOK_DELIVERY] Payload details - messageId: ${payload.messageId}, receivedAt: ${payload.receivedAt}, hasRawData: ${!!payload.rawData}, hasRawContent: ${!!payload.rawContentBase64}`, 'WebhookDeliveryService');

      // Deliver to each subscription (parallel)
      this.logger.log(`[WEBHOOK_DELIVERY] Starting parallel delivery to ${subscriptions.length} subscription(s)`, 'WebhookDeliveryService');
      const deliveryPromises = subscriptions.map((subscription) => {
        this.logger.log(`[WEBHOOK_DELIVERY] Creating delivery promise for subscription: ${subscription.serviceName} (ID: ${subscription.id})`, 'WebhookDeliveryService');
        return this.deliverToSubscription(subscription, payload, inboundEmail);
      });

      this.logger.log(`[WEBHOOK_DELIVERY] Waiting for all delivery promises to settle...`, 'WebhookDeliveryService');
      const results = await Promise.allSettled(deliveryPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      this.logger.log(`[WEBHOOK_DELIVERY] Delivery results - successful: ${successful}, failed: ${failed}, total: ${results.length}`, 'WebhookDeliveryService');

      this.logger.log(`[WEBHOOK_DELIVERY] ===== DELIVER TO SUBSCRIPTIONS END (SUCCESS) =====`, 'WebhookDeliveryService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[WEBHOOK_DELIVERY] ❌ Error delivering to subscriptions: ${errorMessage}`, errorStack);
      this.logger.error(`[WEBHOOK_DELIVERY] ❌ Error delivering to subscriptions: ${errorMessage}`, errorStack, 'WebhookDeliveryService');
      // Don't throw - email is already stored, webhook delivery failure is not critical
    }
  }

  /**
   * Deliver email to a single subscription with retry logic
   */
  private async deliverToSubscription(
    subscription: WebhookSubscription,
    payload: ProcessedEmailPayload,
    inboundEmail: InboundEmail,
  ): Promise<void> {
    console.log(`[WEBHOOK_DELIVERY] Delivering to subscription: ${subscription.serviceName} (${subscription.webhookUrl})`);
    this.logger.log(`[WEBHOOK_DELIVERY] Delivering to subscription: ${subscription.serviceName} (${subscription.webhookUrl})`, 'WebhookDeliveryService');
    this.logger.log(`[WEBHOOK_DELIVERY] Subscription details - ID: ${subscription.id}, retryCount: ${subscription.retryCount}, maxRetries: ${subscription.maxRetries}, totalDeliveries: ${subscription.totalDeliveries}, totalFailures: ${subscription.totalFailures}`, 'WebhookDeliveryService');

    // Check filters
    this.logger.log(`[WEBHOOK_DELIVERY] Checking filters for subscription: ${subscription.serviceName}`, 'WebhookDeliveryService');
    const filterMatch = this.matchesFilters(payload, subscription.filters);
    this.logger.log(`[WEBHOOK_DELIVERY] Filter check result for ${subscription.serviceName}: ${filterMatch ? 'MATCH' : 'NO MATCH'}, filters: ${JSON.stringify(subscription.filters)}`, 'WebhookDeliveryService');
    if (!filterMatch) {
      console.log(`[WEBHOOK_DELIVERY] Email does not match filters for ${subscription.serviceName}, skipping`);
      this.logger.log(`[WEBHOOK_DELIVERY] Email does not match filters for ${subscription.serviceName}, skipping`, 'WebhookDeliveryService');
      this.logger.log(`[WEBHOOK_DELIVERY] Email details - from: ${payload.from}, to: ${payload.to}, subject: ${payload.subject}`, 'WebhookDeliveryService');
      return;
    }

    // Check webhook health before delivery
    this.logger.log(`[WEBHOOK_DELIVERY] Performing health check for subscription: ${subscription.serviceName}`, 'WebhookDeliveryService');
    const isHealthy = await this.checkWebhookHealth(subscription);
    this.logger.log(`[WEBHOOK_DELIVERY] Health check result for ${subscription.serviceName}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`, 'WebhookDeliveryService');
    if (!isHealthy) {
      const errorMsg = `Health check failed for ${subscription.serviceName}, skipping delivery`;
      console.warn(`[WEBHOOK_DELIVERY] ⚠️ ${errorMsg}`);
      this.logger.warn(`[WEBHOOK_DELIVERY] ⚠️ ${errorMsg}`, 'WebhookDeliveryService');
      // Don't count as failure - health check is optional
      return;
    }

    // Apply exponential backoff if retryCount > 0
    if (subscription.retryCount > 0) {
      const delay = Math.min(1000 * Math.pow(2, subscription.retryCount - 1), 30000); // Max 30 seconds
      console.log(`[WEBHOOK_DELIVERY] Applying exponential backoff: ${delay}ms for ${subscription.serviceName} (retryCount: ${subscription.retryCount})`);
      this.logger.log(`[WEBHOOK_DELIVERY] Applying exponential backoff: ${delay}ms for ${subscription.serviceName} (retryCount: ${subscription.retryCount})`, 'WebhookDeliveryService');
      this.logger.log(`[WEBHOOK_DELIVERY] Waiting ${delay}ms before delivery attempt...`, 'WebhookDeliveryService');
      await new Promise(resolve => setTimeout(resolve, delay));
      this.logger.log(`[WEBHOOK_DELIVERY] Backoff delay completed, proceeding with delivery`, 'WebhookDeliveryService');
    }

    try {
      // Prepare webhook payload with signature if secret is configured.
      // Include subscriptionId so subscriber can confirm delivery (e.g. helpdesk callback).
      this.logger.log(`[WEBHOOK_DELIVERY] Preparing webhook payload for ${subscription.serviceName}`, 'WebhookDeliveryService');
      const webhookPayload = {
        event: 'email.received',
        timestamp: new Date().toISOString(),
        data: {
          ...payload,
          subscriptionId: subscription.id,
        },
      };

      // Add signature if secret is configured
      if (subscription.secret) {
        this.logger.log(`[WEBHOOK_DELIVERY] Secret configured for ${subscription.serviceName}, signature will be added (TODO: implement)`, 'WebhookDeliveryService');
        // TODO: Implement HMAC signature
        // webhookPayload.signature = this.generateSignature(webhookPayload, subscription.secret);
      } else {
        this.logger.log(`[WEBHOOK_DELIVERY] No secret configured for ${subscription.serviceName}, sending without signature`, 'WebhookDeliveryService');
      }

      // Per-subscription timeout (doubled on timeout; never suspend)
      const timeoutMs = Math.min(
        subscription.deliveryTimeoutMs ?? 120000,
        MAX_DELIVERY_TIMEOUT_MS,
      );
      const payloadSizeBytes = JSON.stringify(webhookPayload).length;
      const payloadSizeKB = (payloadSizeBytes / 1024).toFixed(2);
      this.logger.log(`[WEBHOOK_DELIVERY] Payload size: ${payloadSizeBytes} bytes (${payloadSizeKB} KB), inboundEmailId: ${inboundEmail.id}, messageId: ${payload.messageId || 'n/a'}`, 'WebhookDeliveryService');
      this.logger.log(`[WEBHOOK_DELIVERY] Sending HTTP POST request to ${subscription.webhookUrl}, timeout: ${timeoutMs}ms, startedAt: ${new Date().toISOString()}`, 'WebhookDeliveryService');
      const requestStartTime = Date.now();
      const response = await firstValueFrom(
        this.httpService.post(subscription.webhookUrl, webhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Notification-Service': 'notifications-microservice',
            'X-Subscription-Id': subscription.id,
          },
          timeout: timeoutMs,
        }),
      );
      const requestDuration = Date.now() - requestStartTime;
      this.logger.log(`[WEBHOOK_DELIVERY] HTTP request completed in ${requestDuration}ms, status: ${response.status}, finishedAt: ${new Date().toISOString()}`, 'WebhookDeliveryService');
      this.logger.log(`[WEBHOOK_DELIVERY] Response body length: ${typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length}`, 'WebhookDeliveryService');

      // Update subscription stats
      this.logger.log(`[WEBHOOK_DELIVERY] Updating subscription stats for ${subscription.serviceName} - totalDeliveries: ${subscription.totalDeliveries} -> ${subscription.totalDeliveries + 1}`, 'WebhookDeliveryService');
      subscription.totalDeliveries += 1;
      subscription.lastDeliveryAt = new Date();
      subscription.retryCount = 0; // Reset retry count on success
      subscription.lastErrorAt = null;
      subscription.lastError = null;
      this.logger.log(`[WEBHOOK_DELIVERY] Saving subscription to database...`, 'WebhookDeliveryService');
      await this.subscriptionRepository.save(subscription);
      this.logger.log(`[WEBHOOK_DELIVERY] Subscription saved successfully`, 'WebhookDeliveryService');

      // Record webhook delivery for confirmation tracking (helpdesk can confirm when ticket is created)
      const delivery = this.webhookDeliveryRepository.create({
        inboundEmailId: inboundEmail.id,
        subscriptionId: subscription.id,
        status: 'sent' as WebhookDeliveryStatus,
        httpStatus: response.status,
      });
      await this.webhookDeliveryRepository.save(delivery);
      this.logger.log(`[WEBHOOK_DELIVERY] Recorded webhook_delivery id=${delivery.id} for inbound_email=${inboundEmail.id} subscription=${subscription.serviceName}`, 'WebhookDeliveryService');

      console.log(`[WEBHOOK_DELIVERY] ✅ Successfully delivered to ${subscription.serviceName} - Status: ${response.status}`);
      this.logger.log(`[WEBHOOK_DELIVERY] ✅ Successfully delivered to ${subscription.serviceName} - Status: ${response.status}`, 'WebhookDeliveryService');
      this.logger.log(`[WEBHOOK_DELIVERY] Response headers: ${JSON.stringify(response.headers)}`, 'WebhookDeliveryService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const failedAt = new Date().toISOString();
      this.logger.error(`[WEBHOOK_DELIVERY] ❌ Exception caught during delivery to ${subscription.serviceName}: ${errorMessage}`, errorStack, 'WebhookDeliveryService');
      this.logger.error(`[WEBHOOK_DELIVERY] Failed at: ${failedAt}, inboundEmailId: ${inboundEmail.id}, webhookUrl: ${subscription.webhookUrl}`, undefined, 'WebhookDeliveryService');

      // On timeout: double delivery timeout for next time and send alert email (never suspend)
      const isTimeout = /timeout|ETIMEDOUT|timed out/i.test(errorMessage);
      if (isTimeout) {
        const prevTimeout = subscription.deliveryTimeoutMs ?? 120000;
        const newTimeout = Math.min(prevTimeout * 2, MAX_DELIVERY_TIMEOUT_MS);
        subscription.deliveryTimeoutMs = newTimeout;
        this.logger.log(
          `[WEBHOOK_DELIVERY] Timeout: doubled delivery timeout ${prevTimeout}ms -> ${newTimeout}ms for ${subscription.serviceName}`,
          'WebhookDeliveryService',
        );
        await this.sendTimeoutAlert(subscription, errorMessage, prevTimeout, newTimeout);
      }

      // Enhanced error handling for SSL/certificate errors (increase maxRetries for retries only)
      const isSSLError = errorMessage.toLowerCase().includes('certificate') ||
                        errorMessage.toLowerCase().includes('ssl') ||
                        errorMessage.toLowerCase().includes('tls') ||
                        errorMessage.toLowerCase().includes('cert');
      this.logger.log(`[WEBHOOK_DELIVERY] Error type analysis - isSSLError: ${isSSLError}, isTimeout: ${isTimeout}, errorMessage: ${errorMessage}`, 'WebhookDeliveryService');
      if (isSSLError && subscription.maxRetries < 10) {
        subscription.maxRetries = 10;
        this.logger.warn(`[WEBHOOK_DELIVERY] SSL error detected, increasing maxRetries to 10 for ${subscription.serviceName}`, 'WebhookDeliveryService');
      }

      // Update subscription stats (never suspend)
      subscription.totalFailures += 1;
      subscription.retryCount += 1;
      subscription.lastErrorAt = new Date();
      subscription.lastError = errorMessage;
      this.logger.error(
        `[WEBHOOK_DELIVERY] ❌ Failed to deliver to ${subscription.serviceName} (attempt ${subscription.retryCount}): ${errorMessage}`,
        errorStack,
        'WebhookDeliveryService',
      );

      await this.subscriptionRepository.save(subscription);
    }
  }

  /**
   * Prepare standardized email payload from InboundEmail entity
   */
  private async prepareEmailPayload(inboundEmail: InboundEmail): Promise<ProcessedEmailPayload> {
    console.log(`[WEBHOOK_DELIVERY] Preparing email payload for ID: ${inboundEmail.id}`);
    this.logger.log(`[WEBHOOK_DELIVERY] Preparing email payload for ID: ${inboundEmail.id}`, 'WebhookDeliveryService');
    this.logger.log(`[WEBHOOK_DELIVERY] Email metadata - from: ${inboundEmail.from}, to: ${inboundEmail.to}, subject: ${inboundEmail.subject || 'N/A'}`, 'WebhookDeliveryService');

    // Process attachments if any (no cap - send all so helpdesk receives full email including 50MB+ attachments)
    const attachments: EmailAttachment[] = [];
    const attachmentCount = inboundEmail.attachments?.length || 0;
    this.logger.log(`[WEBHOOK_DELIVERY] Processing ${attachmentCount} attachment(s)`, 'WebhookDeliveryService');
    if (inboundEmail.attachments && Array.isArray(inboundEmail.attachments)) {
      for (let i = 0; i < inboundEmail.attachments.length; i++) {
        const attachment = inboundEmail.attachments[i];
        this.logger.log(`[WEBHOOK_DELIVERY] Processing attachment ${i + 1}/${attachmentCount}: ${attachment?.filename || 'unknown'}`, 'WebhookDeliveryService');
        try {
          // Attachments: rawBase64 = stored raw base64 (no decode); else legacy decoded string
          if (attachment && attachment.content) {
            this.logger.log(`[WEBHOOK_DELIVERY] Attachment content type: ${typeof attachment.content}, has rawBase64 flag: ${!!(attachment as { rawBase64?: boolean }).rawBase64}`, 'WebhookDeliveryService');
            let base64Content: string;
            if ((attachment as { rawBase64?: boolean }).rawBase64 && typeof attachment.content === 'string') {
              // Raw base64 from email, use as-is (no decode was applied)
              this.logger.log(`[WEBHOOK_DELIVERY] Using raw base64 content (no decode)`, 'WebhookDeliveryService');
              base64Content = attachment.content.replace(/\s/g, '');
            } else if (typeof attachment.content === 'string') {
              this.logger.log(`[WEBHOOK_DELIVERY] Converting string content from latin1 to base64`, 'WebhookDeliveryService');
              base64Content = Buffer.from(attachment.content, 'latin1').toString('base64');
            } else if (Buffer.isBuffer(attachment.content)) {
              this.logger.log(`[WEBHOOK_DELIVERY] Converting Buffer content to base64`, 'WebhookDeliveryService');
              base64Content = attachment.content.toString('base64');
            } else {
              this.logger.log(`[WEBHOOK_DELIVERY] Converting unknown content type to base64 via JSON.stringify`, 'WebhookDeliveryService');
              base64Content = Buffer.from(JSON.stringify(attachment.content)).toString('base64');
            }
            const size = attachment.size ?? Buffer.from(base64Content, 'base64').length;
            this.logger.log(`[WEBHOOK_DELIVERY] Attachment size: ${size} bytes (provided: ${attachment.size || 'calculated'})`, 'WebhookDeliveryService');
            attachments.push({
              filename: attachment.filename || 'attachment',
              contentType: attachment.contentType || 'application/octet-stream',
              size,
              content: base64Content,
            });

            console.log(`[WEBHOOK_DELIVERY] ✅ Processed attachment: ${attachment.filename} (${size} bytes)`);
            this.logger.log(`[WEBHOOK_DELIVERY] ✅ Processed attachment: ${attachment.filename} (${size} bytes), contentType: ${attachment.contentType || 'application/octet-stream'}`, 'WebhookDeliveryService');
          } else {
            this.logger.warn(`[WEBHOOK_DELIVERY] ⚠️ Attachment missing content, skipping`, 'WebhookDeliveryService');
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[WEBHOOK_DELIVERY] ⚠️ Failed to process attachment: ${errorMsg}`);
          this.logger.warn(`[WEBHOOK_DELIVERY] ⚠️ Failed to process attachment: ${errorMsg}`, 'WebhookDeliveryService');
          this.logger.warn(`[WEBHOOK_DELIVERY] Attachment that failed: ${JSON.stringify({ filename: attachment?.filename, contentType: attachment?.contentType, hasContent: !!attachment?.content })}`, 'WebhookDeliveryService');
        }
      }
    }

    this.logger.log(`[WEBHOOK_DELIVERY] Constructing payload object...`, 'WebhookDeliveryService');
    // Clean messageId: remove angle brackets if present (e.g., <message-id> -> message-id)
    let messageId = inboundEmail.rawData?.mail?.messageId || `email-${inboundEmail.id}`;
    if (messageId && messageId.startsWith('<') && messageId.endsWith('>')) {
      messageId = messageId.slice(1, -1);
      this.logger.log(`[WEBHOOK_DELIVERY] Cleaned messageId: removed angle brackets`, 'WebhookDeliveryService');
    }
    // Clean from/to: extract email address from "Display Name <email@domain.com>" format for filter matching
    let fromEmail = inboundEmail.from;
    const fromMatch = fromEmail.match(/<([^>]+)>/);
    if (fromMatch) {
      fromEmail = fromMatch[1];
      this.logger.log(`[WEBHOOK_DELIVERY] Cleaned from field: extracted email from display name`, 'WebhookDeliveryService');
    }
    let toEmail = inboundEmail.to || '';
    const toMatch = toEmail.match(/<([^>]+)>/);
    if (toMatch) {
      toEmail = toMatch[1].trim();
      this.logger.log(`[WEBHOOK_DELIVERY] Cleaned to field: extracted email from display name (e.g. SpeakASAP <contact@speakasap.com>)`, 'WebhookDeliveryService');
    } else if (toEmail) {
      toEmail = toEmail.trim();
    }
    const payload: ProcessedEmailPayload = {
      id: inboundEmail.id,
      from: fromEmail,
      to: toEmail,
      subject: inboundEmail.subject,
      bodyText: inboundEmail.bodyText,
      bodyHtml: inboundEmail.bodyHtml,
      attachments: attachments,
      receivedAt: inboundEmail.receivedAt.toISOString(),
      messageId: messageId,
    };
    this.logger.log(`[WEBHOOK_DELIVERY] Base payload created - messageId: ${payload.messageId}, bodyText length: ${payload.bodyText?.length || 0}, bodyHtml length: ${payload.bodyHtml?.length || 0}`, 'WebhookDeliveryService');

    // Include rawData and raw MIME so downstream services can reconstruct the email exactly as SES delivered it.
    // Omit raw content when it would make payload too large (emails with big attachments) so webhook
    // delivery succeeds and helpdesk still gets body + attachments (avoids timeout/413).
    const MAX_RAW_CONTENT_BASE64_LENGTH = 3 * 1024 * 1024; // ~3MB base64 - keeps total payload under ~4MB
    if (inboundEmail.rawData) {
      this.logger.log(`[WEBHOOK_DELIVERY] Adding rawData to payload`, 'WebhookDeliveryService');
      const rawContent = inboundEmail.rawData.content;
      const rawContentTooLarge = typeof rawContent === 'string' && rawContent.length > MAX_RAW_CONTENT_BASE64_LENGTH;
      if (rawContentTooLarge) {
        this.logger.warn(
          `[WEBHOOK_DELIVERY] Raw content length ${(rawContent as string).length} exceeds ${MAX_RAW_CONTENT_BASE64_LENGTH}, omitting rawContentBase64 and rawData.content so delivery can succeed`,
          'WebhookDeliveryService',
        );
        payload.rawData = { ...inboundEmail.rawData, content: undefined };
      } else {
        payload.rawData = inboundEmail.rawData;
        if (rawContent) {
          payload.rawContentBase64 = rawContent;
          this.logger.log(`[WEBHOOK_DELIVERY] Added rawContentBase64 (length: ${(rawContent as string).length})`, 'WebhookDeliveryService');
        }
      }
      if (inboundEmail.rawData.mail?.headers) {
        // Send decoded Subject in rawHeaders so helpdesk displays correct text instead of =?UTF-8?B??=
        const headers = inboundEmail.rawData.mail.headers as Array<{ name: string; value: string }>;
        payload.rawHeaders = headers.map((h) => {
          const name = h?.name || '';
          const value = h?.value ?? '';
          if (name.toLowerCase() === 'subject' && payload.subject != null) return { name, value: payload.subject };
          return { name, value };
        });
        this.logger.log(`[WEBHOOK_DELIVERY] Added rawHeaders (count: ${payload.rawHeaders.length}) with decoded Subject`, 'WebhookDeliveryService');
      }
    } else {
      this.logger.log(`[WEBHOOK_DELIVERY] No rawData available, payload will not include raw content`, 'WebhookDeliveryService');
    }

    console.log(`[WEBHOOK_DELIVERY] ✅ Prepared payload - subject: ${payload.subject}, attachments: ${payload.attachments.length}`);
    this.logger.log(`[WEBHOOK_DELIVERY] ✅ Prepared payload - subject: ${payload.subject}, attachments: ${payload.attachments.length}`, 'WebhookDeliveryService');
    this.logger.log(`[WEBHOOK_DELIVERY] Payload summary - hasRawData: ${!!payload.rawData}, hasRawContent: ${!!payload.rawContentBase64}, hasRawHeaders: ${!!payload.rawHeaders}`, 'WebhookDeliveryService');

    return payload;
  }

  /**
   * Check if email matches subscription filters
   * Supports wildcard patterns like "*@speakasap.com"
   */
  private matchesFilters(payload: ProcessedEmailPayload, filters: any): boolean {
    this.logger.log(`[WEBHOOK_DELIVERY] Starting filter matching - filters: ${JSON.stringify(filters)}`, 'WebhookDeliveryService');
    if (!filters) {
      this.logger.log(`[WEBHOOK_DELIVERY] No filters configured, matching all emails`, 'WebhookDeliveryService');
      return true; // No filters = match all
    }

    // Filter by 'to' email
    if (filters.to && Array.isArray(filters.to)) {
      this.logger.log(`[WEBHOOK_DELIVERY] Checking 'to' filter - email: ${payload.to}, filters: ${JSON.stringify(filters.to)}`, 'WebhookDeliveryService');
      const matchesTo = filters.to.some((filterTo: string) => {
        if (filterTo.startsWith('*@')) {
          // Wildcard domain match (e.g., "*@speakasap.com")
          const domain = filterTo.substring(2);
          const matches = payload.to.endsWith(`@${domain}`);
          this.logger.log(`[WEBHOOK_DELIVERY] Wildcard domain match check - filter: ${filterTo}, domain: ${domain}, email: ${payload.to}, matches: ${matches}`, 'WebhookDeliveryService');
          return matches;
        }
        const exactMatch = payload.to === filterTo;
        this.logger.log(`[WEBHOOK_DELIVERY] Exact 'to' match check - filter: ${filterTo}, email: ${payload.to}, matches: ${exactMatch}`, 'WebhookDeliveryService');
        return exactMatch;
      });
      if (!matchesTo) {
        this.logger.log(`[WEBHOOK_DELIVERY] 'to' filter did not match, email rejected`, 'WebhookDeliveryService');
        return false;
      }
      this.logger.log(`[WEBHOOK_DELIVERY] 'to' filter matched`, 'WebhookDeliveryService');
    }

    // Filter by 'from' email
    if (filters.from && Array.isArray(filters.from)) {
      this.logger.log(`[WEBHOOK_DELIVERY] Checking 'from' filter - email: ${payload.from}, filters: ${JSON.stringify(filters.from)}`, 'WebhookDeliveryService');
      const matchesFrom = filters.from.some((filterFrom: string) => {
        if (filterFrom.startsWith('*@')) {
          // Wildcard domain match
          const domain = filterFrom.substring(2);
          const matches = payload.from.endsWith(`@${domain}`);
          this.logger.log(`[WEBHOOK_DELIVERY] Wildcard domain match check - filter: ${filterFrom}, domain: ${domain}, email: ${payload.from}, matches: ${matches}`, 'WebhookDeliveryService');
          return matches;
        }
        const exactMatch = payload.from === filterFrom;
        this.logger.log(`[WEBHOOK_DELIVERY] Exact 'from' match check - filter: ${filterFrom}, email: ${payload.from}, matches: ${exactMatch}`, 'WebhookDeliveryService');
        return exactMatch;
      });
      if (!matchesFrom) {
        this.logger.log(`[WEBHOOK_DELIVERY] 'from' filter did not match, email rejected`, 'WebhookDeliveryService');
        return false;
      }
      this.logger.log(`[WEBHOOK_DELIVERY] 'from' filter matched`, 'WebhookDeliveryService');
    }

    // Filter by subject pattern
    if (filters.subjectPattern && payload.subject) {
      this.logger.log(`[WEBHOOK_DELIVERY] Checking subject pattern - pattern: ${filters.subjectPattern}, subject: ${payload.subject}`, 'WebhookDeliveryService');
      try {
        const regex = new RegExp(filters.subjectPattern, 'i'); // Case-insensitive
        const matches = regex.test(payload.subject);
        this.logger.log(`[WEBHOOK_DELIVERY] Subject pattern regex test - matches: ${matches}`, 'WebhookDeliveryService');
        if (!matches) {
          this.logger.log(`[WEBHOOK_DELIVERY] Subject pattern did not match, email rejected`, 'WebhookDeliveryService');
          return false;
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        this.logger.error(`[WEBHOOK_DELIVERY] Invalid subjectPattern regex: ${filters.subjectPattern}, error: ${errorMsg}`, undefined, 'WebhookDeliveryService');
        // If regex is invalid, treat as no match to be safe
        return false;
      }
      this.logger.log(`[WEBHOOK_DELIVERY] Subject pattern matched`, 'WebhookDeliveryService');
    }

    this.logger.log(`[WEBHOOK_DELIVERY] All filters passed, email accepted`, 'WebhookDeliveryService');
    return true;
  }

  /**
   * Check webhook health endpoint before delivery
   * Returns true if health check passes or if health endpoint is not available
   */
  private async checkWebhookHealth(subscription: WebhookSubscription): Promise<boolean> {
    this.logger.log(`[WEBHOOK_DELIVERY] Starting health check for ${subscription.serviceName}`, 'WebhookDeliveryService');
    try {
      // Try to construct health check URL from webhook URL
      // Replace /api/email/webhook or /api/email/inbound with /health
      const originalUrl = subscription.webhookUrl;
      this.logger.log(`[WEBHOOK_DELIVERY] Original webhook URL: ${originalUrl}`, 'WebhookDeliveryService');
      const healthUrl = subscription.webhookUrl
        .replace(/\/api\/email\/(webhook|inbound)\/?$/, '/health')
        .replace(/\/helpdesk\/api\/email\/(webhook|inbound)\/?$/, '/helpdesk/health');
      this.logger.log(`[WEBHOOK_DELIVERY] Constructed health check URL: ${healthUrl}`, 'WebhookDeliveryService');

      // Only check if URL changed (health endpoint exists)
      if (healthUrl === subscription.webhookUrl) {
        this.logger.log(`[WEBHOOK_DELIVERY] Health check URL unchanged, no health endpoint available, allowing delivery`, 'WebhookDeliveryService');
        return true; // No health endpoint, allow delivery
      }

      this.logger.log(`[WEBHOOK_DELIVERY] Sending health check request to ${healthUrl} with 5000ms timeout`, 'WebhookDeliveryService');
      const healthCheckStartTime = Date.now();
      const response = await firstValueFrom(
        this.httpService.get(healthUrl, {
          timeout: 5000, // 5 seconds timeout for health check
        }),
      );
      const healthCheckDuration = Date.now() - healthCheckStartTime;
      this.logger.log(`[WEBHOOK_DELIVERY] Health check completed in ${healthCheckDuration}ms, status: ${response.status}`, 'WebhookDeliveryService');

      const isHealthy = response.status === 200;
      if (!isHealthy) {
        console.warn(`[WEBHOOK_DELIVERY] Health check failed for ${subscription.serviceName}: Status ${response.status}`);
        this.logger.warn(`[WEBHOOK_DELIVERY] Health check failed for ${subscription.serviceName}: Status ${response.status}`, 'WebhookDeliveryService');
        this.logger.warn(`[WEBHOOK_DELIVERY] Health check response headers: ${JSON.stringify(response.headers)}`, 'WebhookDeliveryService');
      } else {
        this.logger.log(`[WEBHOOK_DELIVERY] Health check passed for ${subscription.serviceName}`, 'WebhookDeliveryService');
      }

      return isHealthy;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      // If health check fails, allow delivery anyway (health check is optional)
      console.log(`[WEBHOOK_DELIVERY] Health check unavailable for ${subscription.serviceName}, allowing delivery`);
      this.logger.log(`[WEBHOOK_DELIVERY] Health check unavailable for ${subscription.serviceName}, allowing delivery`, 'WebhookDeliveryService');
      this.logger.log(`[WEBHOOK_DELIVERY] Health check error: ${errorMsg}`, 'WebhookDeliveryService');
      if (errorStack) {
        this.logger.log(`[WEBHOOK_DELIVERY] Health check error stack: ${errorStack}`, 'WebhookDeliveryService');
      }
      return true;
    }
  }

  /**
   * Auto-resume suspended subscriptions
   * Runs every hour to check if suspended subscriptions can be reactivated
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoResumeSuspendedSubscriptions(): Promise<void> {
    console.log(`[WEBHOOK_DELIVERY] ===== AUTO-RESUME CHECK START =====`);
    this.logger.log(`[WEBHOOK_DELIVERY] ===== AUTO-RESUME CHECK START =====`, 'WebhookDeliveryService');

    try {
      const suspended = await this.subscriptionRepository.find({
        where: { status: 'suspended' },
      });

      console.log(`[WEBHOOK_DELIVERY] Found ${suspended.length} suspended subscriptions`);
      this.logger.log(`[WEBHOOK_DELIVERY] Found ${suspended.length} suspended subscriptions`, 'WebhookDeliveryService');

      for (const subscription of suspended) {
        const hoursSinceError = subscription.lastErrorAt
          ? (Date.now() - subscription.lastErrorAt.getTime()) / (1000 * 60 * 60)
          : 24; // If no error time, wait 24 hours

        if (hoursSinceError < this.AUTO_RESUME_CHECK_INTERVAL_HOURS) {
          console.log(`[WEBHOOK_DELIVERY] Skipping ${subscription.serviceName} - only ${hoursSinceError.toFixed(2)} hours since last error`);
          continue;
        }

        console.log(`[WEBHOOK_DELIVERY] Testing ${subscription.serviceName} for auto-resume...`);
        this.logger.log(`[WEBHOOK_DELIVERY] Testing ${subscription.serviceName} for auto-resume...`, 'WebhookDeliveryService');

        try {
          await this.testWebhookDelivery(subscription);
          // Success - reactivate subscription
          subscription.status = 'active';
          subscription.retryCount = 0;
          subscription.lastError = null;
          subscription.lastErrorAt = null;
          await this.subscriptionRepository.save(subscription);

          console.log(`[WEBHOOK_DELIVERY] ✅ Auto-resumed subscription ${subscription.serviceName}`);
          this.logger.log(`[WEBHOOK_DELIVERY] ✅ Auto-resumed subscription ${subscription.serviceName}`, 'WebhookDeliveryService');
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.log(`[WEBHOOK_DELIVERY] Auto-resume failed for ${subscription.serviceName}: ${errorMsg}`);
          this.logger.warn(`[WEBHOOK_DELIVERY] Auto-resume failed for ${subscription.serviceName}: ${errorMsg}`, 'WebhookDeliveryService');
        }
      }

      console.log(`[WEBHOOK_DELIVERY] ===== AUTO-RESUME CHECK END =====`);
      this.logger.log(`[WEBHOOK_DELIVERY] ===== AUTO-RESUME CHECK END =====`, 'WebhookDeliveryService');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WEBHOOK_DELIVERY] ❌ Error during auto-resume check: ${errorMsg}`);
      this.logger.error(`[WEBHOOK_DELIVERY] ❌ Error during auto-resume check: ${errorMsg}`, undefined, 'WebhookDeliveryService');
    }
  }

  /**
   * Test webhook delivery with a health check payload
   */
  private async testWebhookDelivery(subscription: WebhookSubscription): Promise<void> {
    this.logger.log(`[WEBHOOK_DELIVERY] Starting test webhook delivery for ${subscription.serviceName}`, 'WebhookDeliveryService');
    const testPayload = {
      event: 'health.check',
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        service: subscription.serviceName,
      },
    };
    this.logger.log(`[WEBHOOK_DELIVERY] Test payload: ${JSON.stringify(testPayload)}`, 'WebhookDeliveryService');

    this.logger.log(`[WEBHOOK_DELIVERY] Sending test webhook to ${subscription.webhookUrl} with 10000ms timeout`, 'WebhookDeliveryService');
    const testStartTime = Date.now();
    const response = await firstValueFrom(
      this.httpService.post(subscription.webhookUrl, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Notification-Service': 'notifications-microservice',
          'X-Subscription-Id': subscription.id,
          'X-Health-Check': 'true',
        },
        timeout: 10000, // 10 seconds timeout for health check
      }),
    );
    const testDuration = Date.now() - testStartTime;
    this.logger.log(`[WEBHOOK_DELIVERY] Test webhook completed in ${testDuration}ms, status: ${response.status}`, 'WebhookDeliveryService');
    this.logger.log(`[WEBHOOK_DELIVERY] Test webhook response headers: ${JSON.stringify(response.headers)}`, 'WebhookDeliveryService');
  }

  /**
   * Confirm delivery from subscriber (e.g. helpdesk after ticket/comment created).
   * Updates webhook_deliveries so we can query undelivered (status='sent' without confirmation).
   */
  async confirmDelivery(params: {
    inboundEmailId: string;
    subscriptionId: string;
    status: 'delivered' | 'failed';
    ticketId?: string | null;
    commentId?: string | null;
    error?: string | null;
  }): Promise<{ success: boolean; message: string }> {
    const { inboundEmailId, subscriptionId, status, ticketId, commentId, error } = params;
    this.logger.log(`[WEBHOOK_DELIVERY] confirmDelivery inboundEmailId=${inboundEmailId} subscriptionId=${subscriptionId} status=${status} ticketId=${ticketId || 'n/a'} commentId=${commentId || 'n/a'}`, 'WebhookDeliveryService');

    const delivery = await this.webhookDeliveryRepository.findOne({
      where: { inboundEmailId, subscriptionId },
      order: { createdAt: 'DESC' },
    });
    if (!delivery) {
      this.logger.warn(`[WEBHOOK_DELIVERY] confirmDelivery: no webhook_delivery found for inbound=${inboundEmailId} subscription=${subscriptionId}`, 'WebhookDeliveryService');
      return { success: false, message: 'Webhook delivery record not found' };
    }
    delivery.status = status as WebhookDeliveryStatus;
    delivery.deliveredAt = status === 'delivered' ? new Date() : null;
    delivery.ticketId = ticketId ?? null;
    delivery.commentId = commentId ?? null;
    delivery.error = error ?? null;
    await this.webhookDeliveryRepository.save(delivery);
    this.logger.log(`[WEBHOOK_DELIVERY] confirmDelivery: updated delivery id=${delivery.id} to status=${status}`, 'WebhookDeliveryService');
    return { success: true, message: 'Delivery confirmed' };
  }

  /**
   * List inbound emails sent to helpdesk but not yet confirmed delivered (for monitoring/retry).
   */
  async getUndeliveredToHelpdesk(limit: number = 100): Promise<{ inboundEmailId: string; subscriptionId: string; createdAt: string }[]> {
    const subs = await this.subscriptionRepository.find({ where: { serviceName: 'helpdesk', status: 'active' } });
    if (subs.length === 0) return [];
    const subIds = subs.map((s) => s.id);
    const rows = await this.webhookDeliveryRepository
      .createQueryBuilder('d')
      .where('d.subscriptionId IN (:...subIds)', { subIds })
      .andWhere("d.status = 'sent'")
      .orderBy('d.createdAt', 'DESC')
      .take(limit)
      .getMany();
    return rows.map((r) => ({
      inboundEmailId: r.inboundEmailId,
      subscriptionId: r.subscriptionId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Send email alert when webhook delivery times out (so we can fix the issue proactively).
   */
  private async sendTimeoutAlert(
    subscription: WebhookSubscription,
    errorMessage: string,
    prevTimeoutMs: number,
    newTimeoutMs: number,
  ): Promise<void> {
    const to = process.env.WEBHOOK_TIMEOUT_ALERT_EMAIL || 'ssfskype@gmail.com';
    const subject = `[notifications-microservice] Webhook timeout: ${subscription.serviceName}`;
    const message =
      `Webhook delivery to ${subscription.serviceName} timed out.\n\n` +
      `URL: ${subscription.webhookUrl}\n` +
      `Error: ${errorMessage}\n` +
      `Timeout was ${prevTimeoutMs}ms; doubled to ${newTimeoutMs}ms for next delivery (subscription is NOT suspended).\n\n` +
      `Please ensure the endpoint responds quickly (e.g. accept request and process asynchronously).`;
    try {
      await this.emailService.send({
        to,
        subject,
        message,
        contentType: 'text/plain',
        emailProvider: 'ses',
      });
      this.logger.log(`[WEBHOOK_DELIVERY] Timeout alert email sent to ${to}`, 'WebhookDeliveryService');
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[WEBHOOK_DELIVERY] Failed to send timeout alert email: ${errMsg}`, undefined, 'WebhookDeliveryService');
    }
  }

  /**
   * Send alert notification when subscription is suspended (kept for manual suspend; we no longer auto-suspend)
   */
  private async sendSuspensionAlert(subscription: WebhookSubscription, errorMessage: string): Promise<void> {
    this.logger.log(`[WEBHOOK_DELIVERY] Preparing suspension alert for ${subscription.serviceName}`, 'WebhookDeliveryService');
    try {
      // Log suspension alert (can be extended to send email/Telegram notification)
      const alertMsg = `Webhook subscription "${subscription.serviceName}" (${subscription.webhookUrl}) has been suspended after ${subscription.retryCount} failures. Last error: ${errorMessage}`;
      console.error(`[WEBHOOK_DELIVERY] 🚨 ALERT: ${alertMsg}`);
      this.logger.error(`[WEBHOOK_DELIVERY] 🚨 ALERT: ${alertMsg}`, undefined, 'WebhookDeliveryService');
      this.logger.error(`[WEBHOOK_DELIVERY] Suspension details - serviceName: ${subscription.serviceName}, webhookUrl: ${subscription.webhookUrl}, retryCount: ${subscription.retryCount}, maxRetries: ${subscription.maxRetries}, totalFailures: ${subscription.totalFailures}, lastErrorAt: ${subscription.lastErrorAt?.toISOString()}`, 'WebhookDeliveryService');

      // TODO: Send email/Telegram notification to administrators
      // Example:
      // await this.notificationService.sendEmail({
      //   to: 'admin@example.com',
      //   subject: `Webhook Subscription Suspended: ${subscription.serviceName}`,
      //   message: alertMsg,
      // });
      this.logger.log(`[WEBHOOK_DELIVERY] Suspension alert logged (email/Telegram notification not implemented)`, 'WebhookDeliveryService');
    } catch (error) {
      // Don't fail if alert sending fails
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WEBHOOK_DELIVERY] Failed to send suspension alert: ${errorMsg}`);
      this.logger.error(`[WEBHOOK_DELIVERY] Failed to send suspension alert: ${errorMsg}`, undefined, 'WebhookDeliveryService');
    }
  }
}
