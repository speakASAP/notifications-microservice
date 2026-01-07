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

@Controller('webhooks/subscriptions')
export class WebhookSubscriptionController {
  constructor(private readonly subscriptionService: WebhookSubscriptionService) {}

  /**
   * Register a new webhook subscription
   * POST /webhooks/subscriptions
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateSubscriptionDto) {
    return this.subscriptionService.create(createDto);
  }

  /**
   * Get all subscriptions
   * GET /webhooks/subscriptions
   */
  @Get()
  async findAll() {
    return this.subscriptionService.findAll();
  }

  /**
   * Get subscription by ID
   * GET /webhooks/subscriptions/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.subscriptionService.findOne(id);
  }

  /**
   * Update subscription
   * PUT /webhooks/subscriptions/:id
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() updateDto: UpdateSubscriptionDto) {
    return this.subscriptionService.update(id, updateDto);
  }

  /**
   * Delete subscription
   * DELETE /webhooks/subscriptions/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.subscriptionService.remove(id);
  }

  /**
   * Activate subscription
   * POST /webhooks/subscriptions/:id/activate
   */
  @Post(':id/activate')
  async activate(@Param('id') id: string) {
    return this.subscriptionService.activate(id);
  }

  /**
   * Suspend subscription
   * POST /webhooks/subscriptions/:id/suspend
   */
  @Post(':id/suspend')
  async suspend(@Param('id') id: string) {
    return this.subscriptionService.suspend(id);
  }
}
