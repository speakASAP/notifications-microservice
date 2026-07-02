import * as amqp from 'amqplib';
import { ORDERS_EVENT_SOURCE, ORDERS_EVENT_TYPES, ORDERS_EVENT_VERSION } from './order-event.dto';
import { OrdersEventsRabbitmqConsumer } from './orders-events-rabbitmq.consumer';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('OrdersEventsRabbitmqConsumer', () => {
  const originalEnv = process.env;
  const router = {
    route: jest.fn(),
  };
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  let consumeHandler: ((message: any) => void) | undefined;
  const channel = {
    assertExchange: jest.fn(),
    assertQueue: jest.fn(),
    bindQueue: jest.fn(),
    prefetch: jest.fn(),
    consume: jest.fn((queue, handler) => {
      consumeHandler = handler;
      return Promise.resolve({ consumerTag: 'orders-events-consumer' });
    }),
    ack: jest.fn(),
    nack: jest.fn(),
    close: jest.fn(),
  };
  const connection = {
    createChannel: jest.fn(),
    close: jest.fn(),
  };

  function createConsumer() {
    return new OrdersEventsRabbitmqConsumer(router as any, logger as any);
  }

  function createMessage(payload: unknown) {
    return {
      content: Buffer.from(JSON.stringify(payload), 'utf8'),
    };
  }

  function createEvent() {
    return {
      type: ORDERS_EVENT_TYPES.lifecycleChanged,
      eventVersion: ORDERS_EVENT_VERSION,
      eventId: 'orders-event-1',
      occurredAt: '2026-07-02T10:00:00.000Z',
      source: ORDERS_EVENT_SOURCE,
      payload: {
        orderId: 'order-1',
        channel: 'flipflop',
        lifecycleStage: 'warehouse_fulfillment_requested',
        previousLifecycleStage: 'paid_not_delivered',
        status: 'confirmed',
        paymentStatus: 'paid',
        fulfillmentStatus: 'fulfillment_requested',
        deliveryStatus: 'not_started',
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    consumeHandler = undefined;
    process.env = { ...originalEnv };
    connection.createChannel.mockResolvedValue(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
    channel.assertExchange.mockResolvedValue(undefined);
    channel.assertQueue.mockResolvedValue(undefined);
    channel.bindQueue.mockResolvedValue(undefined);
    channel.prefetch.mockResolvedValue(undefined);
    router.route.mockResolvedValue({
      action: 'sent',
      eventId: 'orders-event-1',
      eventType: ORDERS_EVENT_TYPES.lifecycleChanged,
      notificationId: 'notification-1',
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('is disabled by default and does not connect to RabbitMQ', async () => {
    const consumer = createConsumer();

    await consumer.onModuleInit();

    expect(amqp.connect).not.toHaveBeenCalled();
    expect(consumer.getStatus()).toMatchObject({
      enabled: false,
      connected: false,
      consuming: false,
      queue: 'notifications.orders.lifecycle',
      exchange: 'orders.events',
    });
  });

  it('declares Orders exchange, queue, bindings, and DLQ when enabled', async () => {
    process.env.ORDERS_EVENTS_CONSUMER_ENABLED = 'true';
    process.env.RABBITMQ_URL = 'amqp://rabbitmq.internal';
    process.env.ORDERS_EVENTS_QUEUE = 'notifications.orders.lifecycle.test';
    process.env.ORDERS_EVENTS_ROUTING_KEYS = 'orders.order.lifecycle_changed.v1,orders.order.paid.v1';
    process.env.ORDERS_EVENTS_DEAD_LETTER_EXCHANGE = 'notifications.orders.lifecycle.dlx';
    process.env.ORDERS_EVENTS_DEAD_LETTER_QUEUE = 'notifications.orders.lifecycle.dlq';

    const consumer = createConsumer();
    await consumer.onModuleInit();

    expect(amqp.connect).toHaveBeenCalledWith('amqp://rabbitmq.internal');
    expect(channel.assertExchange).toHaveBeenCalledWith('orders.events', 'topic', { durable: true });
    expect(channel.assertExchange).toHaveBeenCalledWith('notifications.orders.lifecycle.dlx', 'topic', { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith('notifications.orders.lifecycle.dlq', { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith('notifications.orders.lifecycle.test', {
      durable: true,
      deadLetterExchange: 'notifications.orders.lifecycle.dlx',
    });
    expect(channel.bindQueue).toHaveBeenCalledWith('notifications.orders.lifecycle.test', 'orders.events', 'orders.order.lifecycle_changed.v1');
    expect(channel.bindQueue).toHaveBeenCalledWith('notifications.orders.lifecycle.test', 'orders.events', 'orders.order.paid.v1');
    expect(channel.consume).toHaveBeenCalledWith('notifications.orders.lifecycle.test', expect.any(Function), { noAck: false });
    expect(consumer.getStatus()).toMatchObject({
      enabled: true,
      connected: true,
      consuming: true,
      deadLetterExchange: 'notifications.orders.lifecycle.dlx',
      deadLetterQueue: 'notifications.orders.lifecycle.dlq',
    });
  });

  it('routes valid messages and acknowledges handled events', async () => {
    process.env.ORDERS_EVENTS_CONSUMER_ENABLED = 'true';
    process.env.RABBITMQ_URL = 'amqp://rabbitmq.internal';
    const consumer = createConsumer();
    await consumer.onModuleInit();

    consumeHandler?.(createMessage(createEvent()));
    await new Promise(process.nextTick);

    expect(router.route).toHaveBeenCalledWith(createEvent());
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(consumer.getStatus().counters).toMatchObject({
      received: 1,
      sent: 1,
      failed: 0,
    });
  });

  it('nacks malformed messages without requeue by default', async () => {
    process.env.ORDERS_EVENTS_CONSUMER_ENABLED = 'true';
    process.env.RABBITMQ_URL = 'amqp://rabbitmq.internal';
    const consumer = createConsumer();
    await consumer.onModuleInit();
    const message = { content: Buffer.from('{bad json', 'utf8') };

    consumeHandler?.(message);
    await new Promise(process.nextTick);

    expect(router.route).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(consumer.getStatus()).toMatchObject({
      lastErrorCode: 'message_processing_failed',
      counters: expect.objectContaining({ received: 1, failed: 1 }),
    });
  });
});
