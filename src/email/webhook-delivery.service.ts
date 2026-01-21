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

    // Check webhook health before delivery
    const isHealthy = await this.checkWebhookHealth(subscription);
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
      await new Promise(resolve => setTimeout(resolve, delay));
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

      // Enhanced error handling for SSL/certificate errors
      const isSSLError = errorMessage.toLowerCase().includes('certificate') ||
                        errorMessage.toLowerCase().includes('ssl') ||
                        errorMessage.toLowerCase().includes('tls') ||
                        errorMessage.toLowerCase().includes('cert');

      // Increase maxRetries for SSL errors (temporary issues)
      if (isSSLError && subscription.maxRetries < 10) {
        subscription.maxRetries = 10;
        console.log(`[WEBHOOK_DELIVERY] ⚠️ SSL error detected, increasing maxRetries to 10 for ${subscription.serviceName}`);
        this.logger.warn(`[WEBHOOK_DELIVERY] ⚠️ SSL error detected, increasing maxRetries to 10 for ${subscription.serviceName}`, 'WebhookDeliveryService');
      }

      // Update subscription stats
      subscription.totalFailures += 1;
      subscription.retryCount += 1;
      subscription.lastErrorAt = new Date();
      subscription.lastError = errorMessage;

      // Enhanced logging with retry details
      console.error(`[WEBHOOK_DELIVERY] ❌ Failed to deliver to ${subscription.serviceName} (attempt ${subscription.retryCount}/${subscription.maxRetries}): ${errorMessage}`, errorStack);
      this.logger.error(`[WEBHOOK_DELIVERY] ❌ Failed to deliver to ${subscription.serviceName} (attempt ${subscription.retryCount}/${subscription.maxRetries}): ${errorMessage}`, errorStack, 'WebhookDeliveryService');

      // Suspend subscription if max retries exceeded
      if (subscription.retryCount >= subscription.maxRetries) {
        subscription.status = 'suspended';
        const suspendMsg = `Suspending subscription ${subscription.serviceName} after ${subscription.retryCount} failures. Last error: ${errorMessage}`;
        console.log(`[WEBHOOK_DELIVERY] ⚠️ ${suspendMsg}`);
        this.logger.warn(`[WEBHOOK_DELIVERY] ⚠️ ${suspendMsg}`, 'WebhookDeliveryService');

        // Send alert notification (if notification service is available)
        await this.sendSuspensionAlert(subscription, errorMessage);
      }

      await this.subscriptionRepository.save(subscription);
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

    // Include rawData and raw MIME so downstream services can reconstruct the email exactly as SES delivered it
    if (inboundEmail.rawData) {
      payload.rawData = inboundEmail.rawData;
      if (inboundEmail.rawData.content) {
        payload.rawContentBase64 = inboundEmail.rawData.content; // already base64 from SES
      }
      if (inboundEmail.rawData.mail?.headers) {
        payload.rawHeaders = inboundEmail.rawData.mail.headers; // untouched headers array
      }
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

  /**
   * Check webhook health endpoint before delivery
   * Returns true if health check passes or if health endpoint is not available
   */
  private async checkWebhookHealth(subscription: WebhookSubscription): Promise<boolean> {
    try {
      // Try to construct health check URL from webhook URL
      // Replace /api/email/webhook or /api/email/inbound with /health
      const healthUrl = subscription.webhookUrl
        .replace(/\/api\/email\/(webhook|inbound)\/?$/, '/health')
        .replace(/\/helpdesk\/api\/email\/(webhook|inbound)\/?$/, '/helpdesk/health');

      // Only check if URL changed (health endpoint exists)
      if (healthUrl === subscription.webhookUrl) {
        return true; // No health endpoint, allow delivery
      }

      const response = await firstValueFrom(
        this.httpService.get(healthUrl, {
          timeout: 5000, // 5 seconds timeout for health check
        }),
      );

      const isHealthy = response.status === 200;
      if (!isHealthy) {
        console.warn(`[WEBHOOK_DELIVERY] Health check failed for ${subscription.serviceName}: Status ${response.status}`);
        this.logger.warn(`[WEBHOOK_DELIVERY] Health check failed for ${subscription.serviceName}: Status ${response.status}`, 'WebhookDeliveryService');
      }

      return isHealthy;
    } catch (error) {
      // If health check fails, allow delivery anyway (health check is optional)
      console.log(`[WEBHOOK_DELIVERY] Health check unavailable for ${subscription.serviceName}, allowing delivery`);
      this.logger.log(`[WEBHOOK_DELIVERY] Health check unavailable for ${subscription.serviceName}, allowing delivery`, 'WebhookDeliveryService');
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
    const testPayload = {
      event: 'health.check',
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        service: subscription.serviceName,
      },
    };

    await firstValueFrom(
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
  }

  /**
   * Send alert notification when subscription is suspended
   */
  private async sendSuspensionAlert(subscription: WebhookSubscription, errorMessage: string): Promise<void> {
    try {
      // Log suspension alert (can be extended to send email/Telegram notification)
      const alertMsg = `Webhook subscription "${subscription.serviceName}" (${subscription.webhookUrl}) has been suspended after ${subscription.retryCount} failures. Last error: ${errorMessage}`;
      console.error(`[WEBHOOK_DELIVERY] 🚨 ALERT: ${alertMsg}`);
      this.logger.error(`[WEBHOOK_DELIVERY] 🚨 ALERT: ${alertMsg}`, undefined, 'WebhookDeliveryService');

      // TODO: Send email/Telegram notification to administrators
      // Example:
      // await this.notificationService.sendEmail({
      //   to: 'admin@example.com',
      //   subject: `Webhook Subscription Suspended: ${subscription.serviceName}`,
      //   message: alertMsg,
      // });
    } catch (error) {
      // Don't fail if alert sending fails
      console.error(`[WEBHOOK_DELIVERY] Failed to send suspension alert: ${error}`);
    }
  }
}
