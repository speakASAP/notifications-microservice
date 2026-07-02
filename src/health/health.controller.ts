/**
 * Health Check Controller
 */

import { Controller, Get, Optional } from '@nestjs/common';
import { Public } from '../auth/roles.decorator';
import { OrdersEventsRabbitmqConsumer } from '../notifications/orders-events/orders-events-rabbitmq.consumer';

@Controller('health')
export class HealthController {
  constructor(
    @Optional()
    private readonly ordersEventsConsumer?: OrdersEventsRabbitmqConsumer,
  ) {}

  @Public()
  @Get()
  health() {
    return {
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'notifications-microservice',
    };
  }

  @Public()
  @Get('orders-events')
  ordersEventsHealth() {
    const consumer = this.ordersEventsConsumer?.getStatus() || null;
    return {
      success: Boolean(consumer?.enabled ? consumer.consuming : true),
      status: consumer?.enabled && !consumer.consuming ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      service: 'notifications-microservice',
      component: 'orders-events-consumer',
      consumer,
    };
  }
}
