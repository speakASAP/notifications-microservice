/**
 * Webhook Subscription Service
 * Manages webhook subscriptions for inbound email notifications
 */

import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '../../shared/logger/logger.service';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto/webhook-subscription.dto';

@Injectable()
export class WebhookSubscriptionService {
  constructor(
    @InjectRepository(WebhookSubscription)
    private subscriptionRepository: Repository<WebhookSubscription>,
    @Inject(LoggerService)
    private logger: LoggerService,
  ) {}

  /** Default filters for helpdesk: all *@speakasap.com (including stashok@speakasap.com) go to helpdesk. */
  private static readonly HELPDESK_DEFAULT_FILTERS = { to: ['*@speakasap.com'] };

  async create(createDto: CreateSubscriptionDto): Promise<WebhookSubscription> {
    this.logger.log(`[SUBSCRIPTION] Creating subscription for service: ${createDto.serviceName}`, 'WebhookSubscriptionService');

    // Validate webhook URL
    try {
      new URL(createDto.webhookUrl);
    } catch (error) {
      throw new BadRequestException('Invalid webhook URL');
    }

    const normalizedServiceName = (createDto.serviceName || '').trim();
    const normalizedWebhookUrl = this.normalizeWebhookUrl(createDto.webhookUrl);

    // Ensure helpdesk subscription receives all @speakasap.com addresses unless filters.to provided
    let filters = createDto.filters ?? null;
    if (normalizedServiceName === 'helpdesk' && (!filters || !filters.to?.length)) {
      filters = { ...(filters || {}), ...WebhookSubscriptionService.HELPDESK_DEFAULT_FILTERS };
      this.logger.log('[SUBSCRIPTION] Helpdesk subscription: using default filters.to = ["*@speakasap.com"]', 'WebhookSubscriptionService');
    }

    const existing = await this.subscriptionRepository.findOne({
      where: {
        serviceName: normalizedServiceName,
        webhookUrl: normalizedWebhookUrl,
        status: 'active',
      },
      order: { createdAt: 'ASC' },
    });
    if (existing) {
      this.logger.warn(
        `[SUBSCRIPTION] Duplicate active subscription prevented: service=${normalizedServiceName}, webhookUrl=${normalizedWebhookUrl}, existingId=${existing.id}`,
        'WebhookSubscriptionService',
      );
      return existing;
    }

    const subscription = this.subscriptionRepository.create({
      serviceName: normalizedServiceName,
      webhookUrl: normalizedWebhookUrl,
      secret: createDto.secret || null,
      filters: filters || null,
      status: 'active',
      maxRetries: createDto.maxRetries || 8,
    });

    const saved = await this.subscriptionRepository.save(subscription);
    await this.deactivateDuplicateActiveSubscriptions(saved.serviceName, saved.webhookUrl, saved.id);
    this.logger.log(`[SUBSCRIPTION] ✅ Created subscription: ${saved.id}`, 'WebhookSubscriptionService');
    return saved;
  }

  async findAll(): Promise<WebhookSubscription[]> {
    return this.subscriptionRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<WebhookSubscription> {
    const subscription = await this.subscriptionRepository.findOne({ where: { id } });
    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }
    return subscription;
  }

  async update(id: string, updateDto: UpdateSubscriptionDto): Promise<WebhookSubscription> {
    const subscription = await this.findOne(id);

    if (updateDto.webhookUrl) {
      try {
        new URL(updateDto.webhookUrl);
      } catch (error) {
        throw new BadRequestException('Invalid webhook URL');
      }
      subscription.webhookUrl = updateDto.webhookUrl;
    }

    if (updateDto.secret !== undefined) {
      subscription.secret = updateDto.secret;
    }

    if (updateDto.filters !== undefined) {
      subscription.filters = updateDto.filters;
    }

    if (updateDto.maxRetries !== undefined) {
      subscription.maxRetries = updateDto.maxRetries;
    }

    const updated = await this.subscriptionRepository.save(subscription);
    this.logger.log(`[SUBSCRIPTION] ✅ Updated subscription: ${updated.id}`, 'WebhookSubscriptionService');
    return updated;
  }

  async remove(id: string): Promise<void> {
    const subscription = await this.findOne(id);
    await this.subscriptionRepository.remove(subscription);
    this.logger.log(`[SUBSCRIPTION] ✅ Deleted subscription: ${id}`, 'WebhookSubscriptionService');
  }

  async activate(id: string): Promise<WebhookSubscription> {
    const subscription = await this.findOne(id);
    subscription.status = 'active';
    subscription.retryCount = 0; // Reset retry count
    subscription.lastError = null;
    const updated = await this.subscriptionRepository.save(subscription);
    this.logger.log(`[SUBSCRIPTION] ✅ Activated subscription: ${id}`, 'WebhookSubscriptionService');
    return updated;
  }

  async suspend(id: string): Promise<WebhookSubscription> {
    const subscription = await this.findOne(id);
    subscription.status = 'suspended';
    const updated = await this.subscriptionRepository.save(subscription);
    this.logger.log(`[SUBSCRIPTION] ✅ Suspended subscription: ${id}`, 'WebhookSubscriptionService');
    return updated;
  }

  async remediateDuplicateSubscriptions(): Promise<{ deactivated: number }> {
    const activeSubs = await this.subscriptionRepository.find({
      where: { status: 'active' },
      order: { createdAt: 'ASC' },
    });
    const groupedByPair = new Map<string, WebhookSubscription[]>();
    for (const sub of activeSubs) {
      const key = `${(sub.serviceName || '').trim()}|${this.normalizeWebhookUrl(sub.webhookUrl)}`;
      const group = groupedByPair.get(key) || [];
      group.push(sub);
      groupedByPair.set(key, group);
    }

    let deactivated = 0;
    for (const [key, group] of groupedByPair.entries()) {
      if (group.length <= 1) {
        continue;
      }
      const keep = group[0];
      for (const duplicate of group.slice(1)) {
        duplicate.status = 'inactive';
        await this.subscriptionRepository.save(duplicate);
        deactivated += 1;
        this.logger.warn(
          `[SUBSCRIPTION] Duplicate active subscription deactivated: keepId=${keep.id}, deactivatedId=${duplicate.id}, pair=${key}`,
          'WebhookSubscriptionService',
        );
      }
    }
    return { deactivated };
  }

  private async deactivateDuplicateActiveSubscriptions(
    serviceName: string,
    webhookUrl: string,
    keepId: string,
  ): Promise<void> {
    const normalizedWebhookUrl = this.normalizeWebhookUrl(webhookUrl);
    const duplicates = await this.subscriptionRepository.find({
      where: {
        serviceName,
        webhookUrl: normalizedWebhookUrl,
        status: 'active',
      },
      order: { createdAt: 'ASC' },
    });
    for (const sub of duplicates) {
      if (sub.id === keepId) {
        continue;
      }
      sub.status = 'inactive';
      await this.subscriptionRepository.save(sub);
      this.logger.warn(
        `[SUBSCRIPTION] Duplicate active subscription auto-deactivated: keepId=${keepId}, deactivatedId=${sub.id}, service=${serviceName}, webhookUrl=${normalizedWebhookUrl}`,
        'WebhookSubscriptionService',
      );
    }
  }

  private normalizeWebhookUrl(webhookUrl: string): string {
    return (webhookUrl || '').trim().replace(/\/+$/, '');
  }
}
