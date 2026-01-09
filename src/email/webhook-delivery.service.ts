/**
 * Webhook Delivery Service
 * Handles delivery of processed inbound emails to subscribed services via webhooks
 */

import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { LoggerService } from '../../shared/logger/logger.service';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { InboundEmail } from './entities/inbound-email.entity';
import { firstValueFrom } from 'rxjs';

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
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: string; // Base64 encoded
}

@Injectable()
export class WebhookDeliveryService {
  constructor(
    @InjectRepository(WebhookSubscription)
    private subscriptionRepository: Repository<WebhookSubscription>,
    @InjectRepository(InboundEmail)
    private inboundEmailRepository: Repository<InboundEmail>,
    @Inject(LoggerService)
    private logger: LoggerService,
    private httpService: HttpService,
  ) {}

  /**
   * Deliver processed email to all active subscriptions
   */
  async deliverToSubscriptions(inboundEmail: InboundEmail): Promise<void> {
    console.log(`[WEBHOOK_DELIVERY] ===== DELIVER TO SUBSCRIPTIONS START =====`);
    console.log(`[WEBHOOK_DELIVERY] Email ID: ${inboundEmail.id}, from: ${inboundEmail.from}, to: ${inboundEmail.to}`);
    this.logger.log(`[WEBHOOK_DELIVERY] ===== DELIVER TO SUBSCRIPTIONS START =====`, 'WebhookDeliveryService');
    this.logger.log(`[WEBHOOK_DELIVERY] Email ID: ${inboundEmail.id}, from: ${inboundEmail.from}, to: ${inboundEmail.to}`, 'WebhookDeliveryService');

    try {
      // Get all active subscriptions
      const subscriptions = await this.subscriptionRepository.find({
        where: { status: 'active' },
      });

      console.log(`[WEBHOOK_DELIVERY] Found ${subscriptions.length} active subscriptions`);
      this.logger.log(`[WEBHOOK_DELIVERY] Found ${subscriptions.length} active subscriptions`, 'WebhookDeliveryService');

      if (subscriptions.length === 0) {
        console.log(`[WEBHOOK_DELIVERY] No active subscriptions, skipping delivery`);
        this.logger.log(`[WEBHOOK_DELIVERY] No active subscriptions, skipping delivery`, 'WebhookDeliveryService');
        return;
      }

      // Prepare standardized email payload
      const payload = await this.prepareEmailPayload(inboundEmail);
      console.log(`[WEBHOOK_DELIVERY] ✅ Prepared email payload - subject: ${payload.subject}, attachments: ${payload.attachments.length}`);
      this.logger.log(`[WEBHOOK_DELIVERY] ✅ Prepared email payload - subject: ${payload.subject}, attachments: ${payload.attachments.length}`, 'WebhookDeliveryService');

      // Deliver to each subscription (parallel)
      const deliveryPromises = subscriptions.map((subscription) =>
        this.deliverToSubscription(subscription, payload, inboundEmail),
      );

      await Promise.allSettled(deliveryPromises);

      console.log(`[WEBHOOK_DELIVERY] ===== DELIVER TO SUBSCRIPTIONS END (SUCCESS) =====`);
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

    // Check filters
    if (!this.matchesFilters(payload, subscription.filters)) {
      console.log(`[WEBHOOK_DELIVERY] Email does not match filters for ${subscription.serviceName}, skipping`);
      this.logger.log(`[WEBHOOK_DELIVERY] Email does not match filters for ${subscription.serviceName}, skipping`, 'WebhookDeliveryService');
      return;
    }

    try {
      // Prepare webhook payload with signature if secret is configured
      const webhookPayload = {
        event: 'email.received',
        timestamp: new Date().toISOString(),
        data: payload,
      };

      // Add signature if secret is configured
      if (subscription.secret) {
        // TODO: Implement HMAC signature
        // webhookPayload.signature = this.generateSignature(webhookPayload, subscription.secret);
      }

      // Send webhook
      const response = await firstValueFrom(
        this.httpService.post(subscription.webhookUrl, webhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Notification-Service': 'notifications-microservice',
            'X-Subscription-Id': subscription.id,
          },
          timeout: 20000, // 20 seconds timeout
        }),
      );

      // Update subscription stats
      subscription.totalDeliveries += 1;
      subscription.lastDeliveryAt = new Date();
      subscription.retryCount = 0; // Reset retry count on success
      subscription.lastErrorAt = null;
      subscription.lastError = null;
      await this.subscriptionRepository.save(subscription);

      console.log(`[WEBHOOK_DELIVERY] ✅ Successfully delivered to ${subscription.serviceName} - Status: ${response.status}`);
      this.logger.log(`[WEBHOOK_DELIVERY] ✅ Successfully delivered to ${subscription.serviceName} - Status: ${response.status}`, 'WebhookDeliveryService');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Update subscription stats
      subscription.totalFailures += 1;
      subscription.retryCount += 1;
      subscription.lastErrorAt = new Date();
      subscription.lastError = errorMessage;

      // Suspend subscription if max retries exceeded
      if (subscription.retryCount >= subscription.maxRetries) {
        subscription.status = 'suspended';
        console.log(`[WEBHOOK_DELIVERY] ⚠️ Suspending subscription ${subscription.serviceName} after ${subscription.retryCount} failures`);
        this.logger.warn(`[WEBHOOK_DELIVERY] ⚠️ Suspending subscription ${subscription.serviceName} after ${subscription.retryCount} failures`, 'WebhookDeliveryService');
      }

      await this.subscriptionRepository.save(subscription);

      console.error(`[WEBHOOK_DELIVERY] ❌ Failed to deliver to ${subscription.serviceName}: ${errorMessage}`, errorStack);
      this.logger.error(`[WEBHOOK_DELIVERY] ❌ Failed to deliver to ${subscription.serviceName}: ${errorMessage}`, errorStack, 'WebhookDeliveryService');

      // TODO: Implement retry queue for failed deliveries
    }
  }

  /**
   * Prepare standardized email payload from InboundEmail entity
   */
  private async prepareEmailPayload(inboundEmail: InboundEmail): Promise<ProcessedEmailPayload> {
    console.log(`[WEBHOOK_DELIVERY] Preparing email payload for ID: ${inboundEmail.id}`);
    this.logger.log(`[WEBHOOK_DELIVERY] Preparing email payload for ID: ${inboundEmail.id}`, 'WebhookDeliveryService');

    // Process attachments if any
    const attachments: EmailAttachment[] = [];
    if (inboundEmail.attachments && Array.isArray(inboundEmail.attachments)) {
      for (const attachment of inboundEmail.attachments) {
        try {
          // Attachments format from parseEmailParts: { filename, contentType, content (raw string from email) }
          if (attachment && attachment.content) {
            // Convert content to base64 (content is raw string from email parsing)
            let base64Content: string;
            if (typeof attachment.content === 'string') {
              // Content is raw string from email, encode to base64
              base64Content = Buffer.from(attachment.content, 'utf-8').toString('base64');
            } else if (Buffer.isBuffer(attachment.content)) {
              base64Content = attachment.content.toString('base64');
            } else {
              // Fallback: try to stringify and encode
              base64Content = Buffer.from(JSON.stringify(attachment.content)).toString('base64');
            }
            
            const size = attachment.size || Buffer.from(base64Content, 'base64').length;
            
            attachments.push({
              filename: attachment.filename || 'attachment',
              contentType: attachment.contentType || 'application/octet-stream',
              size: size,
              content: base64Content,
            });
            
            console.log(`[WEBHOOK_DELIVERY] ✅ Processed attachment: ${attachment.filename} (${size} bytes)`);
            this.logger.log(`[WEBHOOK_DELIVERY] ✅ Processed attachment: ${attachment.filename} (${size} bytes)`, 'WebhookDeliveryService');
          }
        } catch (error) {
          console.error(`[WEBHOOK_DELIVERY] ⚠️ Failed to process attachment: ${error}`);
          this.logger.warn(`[WEBHOOK_DELIVERY] ⚠️ Failed to process attachment: ${error}`, 'WebhookDeliveryService');
        }
      }
    }

    const payload: ProcessedEmailPayload = {
      id: inboundEmail.id,
      from: inboundEmail.from,
      to: inboundEmail.to,
      subject: inboundEmail.subject,
      bodyText: inboundEmail.bodyText,
      bodyHtml: inboundEmail.bodyHtml,
      attachments: attachments,
      receivedAt: inboundEmail.receivedAt.toISOString(),
      messageId: inboundEmail.rawData?.mail?.messageId || `email-${inboundEmail.id}`,
    };

    // Include rawData if needed (for advanced use cases)
    if (inboundEmail.rawData) {
      payload.rawData = inboundEmail.rawData;
    }

    console.log(`[WEBHOOK_DELIVERY] ✅ Prepared payload - subject: ${payload.subject}, attachments: ${payload.attachments.length}`);
    this.logger.log(`[WEBHOOK_DELIVERY] ✅ Prepared payload - subject: ${payload.subject}, attachments: ${payload.attachments.length}`, 'WebhookDeliveryService');

    return payload;
  }

  /**
   * Check if email matches subscription filters
   * Supports wildcard patterns like "*@speakasap.com"
   */
  private matchesFilters(payload: ProcessedEmailPayload, filters: any): boolean {
    if (!filters) {
      return true; // No filters = match all
    }

    // Filter by 'to' email
    if (filters.to && Array.isArray(filters.to)) {
      const matchesTo = filters.to.some((filterTo: string) => {
        if (filterTo.startsWith('*@')) {
          // Wildcard domain match (e.g., "*@speakasap.com")
          const domain = filterTo.substring(2);
          return payload.to.endsWith(`@${domain}`);
        }
        return payload.to === filterTo;
      });
      if (!matchesTo) {
        return false;
      }
    }

    // Filter by 'from' email
    if (filters.from && Array.isArray(filters.from)) {
      const matchesFrom = filters.from.some((filterFrom: string) => {
        if (filterFrom.startsWith('*@')) {
          // Wildcard domain match
          const domain = filterFrom.substring(2);
          return payload.from.endsWith(`@${domain}`);
        }
        return payload.from === filterFrom;
      });
      if (!matchesFrom) {
        return false;
      }
    }

    // Filter by subject pattern
    if (filters.subjectPattern && payload.subject) {
      try {
        const regex = new RegExp(filters.subjectPattern, 'i'); // Case-insensitive
        if (!regex.test(payload.subject)) {
          return false;
        }
      } catch (e) {
        this.logger.error(`[WEBHOOK_DELIVERY] Invalid subjectPattern regex: ${filters.subjectPattern}, error: ${e}`, undefined, 'WebhookDeliveryService');
        // If regex is invalid, treat as no match to be safe
        return false;
      }
    }

    return true;
  }
}
