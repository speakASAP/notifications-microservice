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

  async create(createDto: CreateSubscriptionDto): Promise<WebhookSubscription> {
    this.logger.log(`[SUBSCRIPTION] Creating subscription for service: ${createDto.serviceName}`, 'WebhookSubscriptionService');

    // Validate webhook URL
    try {
      new URL(createDto.webhookUrl);
    } catch (error) {
      throw new BadRequestException('Invalid webhook URL');
    }

    const subscription = this.subscriptionRepository.create({
      serviceName: createDto.serviceName,
      webhookUrl: createDto.webhookUrl,
      secret: createDto.secret || null,
      filters: createDto.filters || null,
      status: 'active',
      maxRetries: createDto.maxRetries || 3,
    });

    const saved = await this.subscriptionRepository.save(subscription);
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
}
