import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { LoggerService } from '../../../shared/logger/logger.service';
import { ORDERS_EVENT_TYPES } from './order-event.dto';
import {
  OrdersEventNotificationResult,
  OrdersEventNotificationRouter,
} from './orders-event-notification.router';

export interface OrdersEventsConsumerStatus {
  enabled: boolean;
  connected: boolean;
  consuming: boolean;
  exchange: string;
  queue: string;
  routingKeys: string[];
  deadLetterExchange: string | null;
  deadLetterQueue: string | null;
  requeueOnError: boolean;
  lastErrorCode: string | null;
  counters: {
    received: number;
    sent: number;
    deduped: number;
    skipped: number;
    ignored: number;
    failed: number;
  };
}

interface OrdersEventsConsumerConfig {
  enabled: boolean;
  url?: string;
  exchange: string;
  queue: string;
  routingKeys: string[];
  deadLetterExchange: string | null;
  deadLetterQueue: string | null;
  prefetch: number;
  requeueOnError: boolean;
}

const DEFAULT_EXCHANGE = 'orders.events';
const DEFAULT_QUEUE = 'notifications.orders.lifecycle';
const DEFAULT_ROUTING_KEYS = Object.values(ORDERS_EVENT_TYPES);

@Injectable()
export class OrdersEventsRabbitmqConsumer implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private consuming = false;
  private lastErrorCode: string | null = null;
  private readonly counters = {
    received: 0,
    sent: 0,
    deduped: 0,
    skipped: 0,
    ignored: 0,
    failed: 0,
  };

  constructor(
    private readonly router: OrdersEventNotificationRouter,
    @Inject(LoggerService)
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    const config = this.readConfig();
    if (!config.enabled) {
      this.logger.log(
        '[OrdersEventsRabbitmqConsumer] disabled; set ORDERS_EVENTS_CONSUMER_ENABLED=true to consume Orders events',
        'OrdersEventsRabbitmqConsumer',
      );
      return;
    }

    if (!config.url) {
      this.lastErrorCode = 'missing_rabbitmq_url';
      this.logger.warn(
        '[OrdersEventsRabbitmqConsumer] enabled but RABBITMQ_URL is missing',
        'OrdersEventsRabbitmqConsumer',
      );
      return;
    }

    await this.connect(config);
  }

  async onModuleDestroy() {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch {
      this.lastErrorCode = 'shutdown_failed';
    } finally {
      this.consuming = false;
    }
  }

  getStatus(): OrdersEventsConsumerStatus {
    const config = this.readConfig();
    return {
      enabled: config.enabled,
      connected: Boolean(this.channel),
      consuming: this.consuming,
      exchange: config.exchange,
      queue: config.queue,
      routingKeys: config.routingKeys,
      deadLetterExchange: config.deadLetterExchange,
      deadLetterQueue: config.deadLetterQueue,
      requeueOnError: config.requeueOnError,
      lastErrorCode: this.lastErrorCode,
      counters: { ...this.counters },
    };
  }

  private async connect(config: OrdersEventsConsumerConfig) {
    try {
      const connection = await amqp.connect(config.url as string);
      this.connection = connection;
      this.channel = await connection.createChannel();
      await this.channel.assertExchange(config.exchange, 'topic', { durable: true });

      const queueOptions: amqp.Options.AssertQueue = { durable: true };
      if (config.deadLetterExchange) {
        await this.channel.assertExchange(config.deadLetterExchange, 'topic', { durable: true });
        queueOptions.deadLetterExchange = config.deadLetterExchange;
        if (config.deadLetterQueue) {
          await this.channel.assertQueue(config.deadLetterQueue, { durable: true });
          await this.channel.bindQueue(config.deadLetterQueue, config.deadLetterExchange, '#');
        }
      }

      await this.channel.assertQueue(config.queue, queueOptions);
      for (const routingKey of config.routingKeys) {
        await this.channel.bindQueue(config.queue, config.exchange, routingKey);
      }
      await this.channel.prefetch(config.prefetch);
      await this.channel.consume(config.queue, (message) => {
        void this.handleMessage(message, config);
      }, { noAck: false });
      this.consuming = true;
      this.lastErrorCode = null;
      this.logger.log(
        `[OrdersEventsRabbitmqConsumer] consuming queue=${config.queue} exchange=${config.exchange} bindings=${config.routingKeys.length}`,
        'OrdersEventsRabbitmqConsumer',
      );
    } catch {
      this.channel = null;
      this.connection = null;
      this.consuming = false;
      this.lastErrorCode = 'rabbitmq_connect_failed';
      this.logger.error(
        '[OrdersEventsRabbitmqConsumer] failed to connect to Orders events broker',
        undefined,
        'OrdersEventsRabbitmqConsumer',
      );
    }
  }

  private async handleMessage(message: amqp.ConsumeMessage | null, config: OrdersEventsConsumerConfig) {
    if (!message || !this.channel) return;

    this.counters.received += 1;
    try {
      const parsed = JSON.parse(message.content.toString('utf8'));
      const result = await this.router.route(parsed);
      this.recordResult(result);
      this.channel.ack(message);
    } catch {
      this.counters.failed += 1;
      this.lastErrorCode = 'message_processing_failed';
      this.logger.error(
        '[OrdersEventsRabbitmqConsumer] failed to process Orders event message',
        undefined,
        'OrdersEventsRabbitmqConsumer',
      );
      this.channel.nack(message, false, config.requeueOnError);
    }
  }

  private recordResult(result: OrdersEventNotificationResult) {
    switch (result.action) {
      case 'sent':
        this.counters.sent += 1;
        break;
      case 'deduped':
        this.counters.deduped += 1;
        break;
      case 'skipped':
        this.counters.skipped += 1;
        break;
      case 'ignored':
        this.counters.ignored += 1;
        break;
    }
  }

  private readConfig(): OrdersEventsConsumerConfig {
    const exchange = readStringEnv('ORDERS_EVENTS_EXCHANGE', DEFAULT_EXCHANGE);
    const queue = readStringEnv('ORDERS_EVENTS_QUEUE', DEFAULT_QUEUE);
    const routingKeys = readListEnv('ORDERS_EVENTS_ROUTING_KEYS', DEFAULT_ROUTING_KEYS);
    const deadLetterExchange = readOptionalStringEnv('ORDERS_EVENTS_DEAD_LETTER_EXCHANGE');
    const deadLetterQueue = readOptionalStringEnv('ORDERS_EVENTS_DEAD_LETTER_QUEUE');
    return {
      enabled: readBooleanEnv('ORDERS_EVENTS_CONSUMER_ENABLED', false),
      url: readOptionalStringEnv('RABBITMQ_URL'),
      exchange,
      queue,
      routingKeys,
      deadLetterExchange,
      deadLetterQueue,
      prefetch: readPositiveIntEnv('ORDERS_EVENTS_PREFETCH', 1),
      requeueOnError: readBooleanEnv('ORDERS_EVENTS_REQUEUE_ON_ERROR', false),
    };
  }
}

function readOptionalStringEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim().length === 0) return undefined;
  return value.trim();
}

function readStringEnv(name: string, fallback: string): string {
  return readOptionalStringEnv(name) || fallback;
}

function readListEnv(name: string, fallback: string[]): string[] {
  const value = readOptionalStringEnv(name);
  if (!value) return [...fallback];
  const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallback];
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = readOptionalStringEnv(name);
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return value;
}
