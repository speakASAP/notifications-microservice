import { Roles } from '../auth/roles.decorator';
/**
 * Webhook Subscription Controller
 * API for managing webhook subscriptions for inbound email notifications
 */

import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { WebhookSubscriptionService } from './webhook-subscription.service';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto/webhook-subscription.dto';
import { NOTIFICATIONS_ADMIN_ROLES, NOTIFICATIONS_READ_ROLES } from '../auth/roles.constants';

@Controller('webhooks/subscriptions')
export class WebhookSubscriptionController {
  constructor(private readonly subscriptionService: WebhookSubscriptionService) {}

  /**
   * Register a new webhook subscription
   * POST /webhooks/subscriptions
   */
  @Roles(...NOTIFICATIONS_ADMIN_ROLES)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateSubscriptionDto) {
    return this.subscriptionService.create(createDto);
  }

  /**
   * Get all subscriptions
   * GET /webhooks/subscriptions
   */
  @Roles(...NOTIFICATIONS_READ_ROLES)
  @Get()
  async findAll() {
    return this.subscriptionService.findAll();
  }

  /**
   * Get subscription by ID
   * GET /webhooks/subscriptions/:id
   */
  @Roles(...NOTIFICATIONS_READ_ROLES)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.subscriptionService.findOne(id);
  }

  /**
   * Update subscription
   * PUT /webhooks/subscriptions/:id
   */
  @Roles(...NOTIFICATIONS_ADMIN_ROLES)
  @Put(':id')
  async update(@Param('id') id: string, @Body() updateDto: UpdateSubscriptionDto) {
    return this.subscriptionService.update(id, updateDto);
  }

  /**
   * Delete subscription
   * DELETE /webhooks/subscriptions/:id
   */
  @Roles(...NOTIFICATIONS_ADMIN_ROLES)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.subscriptionService.remove(id);
  }

  /**
   * Activate subscription
   * POST /webhooks/subscriptions/:id/activate
   */
  @Roles(...NOTIFICATIONS_ADMIN_ROLES)
  @Post(':id/activate')
  async activate(@Param('id') id: string) {
    return this.subscriptionService.activate(id);
  }

  /**
   * Suspend subscription
   * POST /webhooks/subscriptions/:id/suspend
   */
  @Roles(...NOTIFICATIONS_ADMIN_ROLES)
  @Post(':id/suspend')
  async suspend(@Param('id') id: string) {
    return this.subscriptionService.suspend(id);
  }

  /**
   * Deactivate duplicate active subscriptions with same serviceName + webhookUrl.
   * Keeps the oldest active row in each group.
   * POST /webhooks/subscriptions/remediate-duplicates
   */
  @Roles(...NOTIFICATIONS_ADMIN_ROLES)
  @Post('remediate-duplicates')
  async remediateDuplicates() {
    return this.subscriptionService.remediateDuplicateSubscriptions();
  }
}
