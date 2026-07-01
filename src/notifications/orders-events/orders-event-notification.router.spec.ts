import { OrdersEventNotificationRouter } from './orders-event-notification.router';
import { ORDERS_EVENT_SOURCE, ORDERS_EVENT_TYPES, ORDERS_EVENT_VERSION } from './order-event.dto';
import { NotificationStatus } from '../entities/notification.entity';
import { NotificationType } from '../dto/send-notification.dto';

describe('OrdersEventNotificationRouter', () => {
  const originalEnv = process.env;
  const notificationsService = {
    send: jest.fn(),
  };
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const notificationRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  function createRouter() {
    return new OrdersEventNotificationRouter(
      notificationsService as any,
      notificationRepository as any,
      logger as any,
    );
  }

  function createEvent(overrides: Record<string, unknown> = {}) {
    return {
      type: ORDERS_EVENT_TYPES.created,
      eventVersion: ORDERS_EVENT_VERSION,
      eventId: 'orders-event-1',
      occurredAt: '2026-07-01T10:00:00.000Z',
      source: ORDERS_EVENT_SOURCE,
      payload: {
        orderId: 'order-1',
        channel: 'flipflop',
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ORDERS_EVENTS_NOTIFICATION_RECIPIENT: 'ops@example.com',
    };
    queryBuilder.getOne.mockResolvedValue(null);
    notificationsService.send.mockResolvedValue({
      id: 'notification-1',
      status: 'sent',
      channel: 'email',
      recipient: 'ops@example.com',
      messageId: 'message-1',
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('routes a verified order-created event to the existing notification send path', async () => {
    const router = createRouter();

    const result = await router.route(createEvent());

    expect(result).toEqual({
      action: 'sent',
      eventId: 'orders-event-1',
      eventType: ORDERS_EVENT_TYPES.created,
      notificationId: 'notification-1',
    });
    expect(notificationsService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'ops@example.com',
        type: NotificationType.ORDER_CONFIRMATION,
        subject: 'Order order-1 created',
        service: 'orders-microservice',
        purpose: 'transactional',
        channelKey: 'orders.lifecycle',
      }),
    );
    expect(notificationsService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        templateData: expect.objectContaining({
          ordersEvent: expect.objectContaining({
            eventId: 'orders-event-1',
            eventType: ORDERS_EVENT_TYPES.created,
            orderId: 'order-1',
            channel: 'flipflop',
          }),
        }),
      }),
    );
  });

  it('dedupes repeated delivery by existing Orders event id before sending', async () => {
    queryBuilder.getOne.mockResolvedValue({
      id: 'notification-existing',
      status: NotificationStatus.SENT,
    });
    const router = createRouter();

    const result = await router.route(createEvent());

    expect(result).toEqual({
      action: 'deduped',
      eventId: 'orders-event-1',
      eventType: ORDERS_EVENT_TYPES.created,
      notificationId: 'notification-existing',
    });
    expect(notificationsService.send).not.toHaveBeenCalled();
    expect(queryBuilder.where).toHaveBeenCalledWith('notification."templateData" @> :eventFilter', {
      eventFilter: JSON.stringify({ ordersEvent: { eventId: 'orders-event-1' } }),
    });
  });

  it('skips send when no approved recipient is configured', async () => {
    delete process.env.ORDERS_EVENTS_NOTIFICATION_RECIPIENT;
    const router = createRouter();

    const result = await router.route(createEvent());

    expect(result).toEqual({
      action: 'skipped',
      eventId: 'orders-event-1',
      eventType: ORDERS_EVENT_TYPES.created,
      reason: 'missing_orders_events_notification_recipient',
    });
    expect(notificationsService.send).not.toHaveBeenCalled();
  });

  it('rejects Orders event payloads that contain forbidden sensitive fields', async () => {
    const router = createRouter();

    const result = await router.route(
      createEvent({
        payload: {
          orderId: 'order-1',
          channel: 'flipflop',
          customerEmail: 'customer@example.com',
        },
      }),
    );

    expect(result).toEqual({
      action: 'ignored',
      reason: 'payload_contains_forbidden_fields',
    });
    expect(notificationsService.send).not.toHaveBeenCalled();
  });

  it('maps paid, shipped, updated, and cancelled events to existing notification types', async () => {
    const router = createRouter();

    await router.route(
      createEvent({
        type: ORDERS_EVENT_TYPES.paid,
        eventId: 'paid-event',
        payload: { orderId: 'order-1', paymentStatus: 'paid' },
      }),
    );
    await router.route(
      createEvent({
        type: ORDERS_EVENT_TYPES.shipped,
        eventId: 'shipped-event',
        payload: { orderId: 'order-1', shipmentStatus: 'shipped', shipmentLookupRequired: true },
      }),
    );
    await router.route(
      createEvent({
        type: ORDERS_EVENT_TYPES.updated,
        eventId: 'updated-event',
        payload: { orderId: 'order-1', status: 'confirmed', previousStatus: 'pending' },
      }),
    );
    await router.route(
      createEvent({
        type: ORDERS_EVENT_TYPES.cancelled,
        eventId: 'cancelled-event',
        payload: { orderId: 'order-1', previousStatus: 'confirmed' },
      }),
    );

    expect(notificationsService.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: NotificationType.PAYMENT_CONFIRMATION }),
    );
    expect(notificationsService.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: NotificationType.SHIPMENT_TRACKING }),
    );
    expect(notificationsService.send).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ type: NotificationType.ORDER_STATUS_UPDATE }),
    );
    expect(notificationsService.send).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ type: NotificationType.ORDER_STATUS_UPDATE }),
    );
  });
});
