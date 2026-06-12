import { of, throwError } from 'rxjs';
import { WebhookDeliveryService } from './webhook-delivery.service';

describe('WebhookDeliveryService', () => {
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const emailService = {
    send: jest.fn(),
  };

  function createInboundEmail() {
    return {
      id: 'email-1',
      from: 'sender@example.com',
      to: 'support@example.com',
      subject: 'Need help',
      bodyText: 'Message body',
      bodyHtml: null,
      attachments: null,
      receivedAt: new Date('2026-06-12T10:00:00.000Z'),
      rawData: {
        mail: {
          messageId: '<message-1@example.com>',
          headers: [],
        },
      },
    } as any;
  }

  function createSubscription(overrides: Record<string, unknown> = {}) {
    return {
      id: 'subscription-1',
      serviceName: 'helpdesk',
      webhookUrl: 'https://helpdesk.example.com/webhook',
      secret: null,
      filters: null,
      status: 'active',
      retryCount: 0,
      maxRetries: 3,
      deliveryTimeoutMs: 120000,
      lastDeliveryAt: null,
      lastErrorAt: null,
      lastError: null,
      totalDeliveries: 0,
      totalFailures: 0,
      ...overrides,
    } as any;
  }

  function createService(options: {
    subscriptions?: any[];
    postResult?: any;
    getResult?: any;
  } = {}) {
    const subscriptions = options.subscriptions ?? [createSubscription()];
    const subscriptionRepository = {
      find: jest.fn().mockResolvedValue(subscriptions),
      save: jest.fn(async (entity) => entity),
    };
    const inboundEmailRepository = {};
    const webhookDeliveryRepository = {
      create: jest.fn((payload) => ({ id: 'delivery-1', ...payload })),
      save: jest.fn(async (entity) => entity),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const httpService = {
      get: jest.fn(() => options.getResult ?? of({ status: 200, headers: {}, data: {} })),
      post: jest.fn(() => options.postResult ?? of({ status: 200, headers: {}, data: {} })),
    };

    const service = new WebhookDeliveryService(
      subscriptionRepository as any,
      inboundEmailRepository as any,
      webhookDeliveryRepository as any,
      logger as any,
      httpService as any,
      emailService as any,
    );

    return {
      service,
      subscriptionRepository,
      webhookDeliveryRepository,
      httpService,
      subscriptions,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a delivered webhook delivery row after a successful post', async () => {
    const { service, webhookDeliveryRepository } = createService();

    await service.deliverToSubscriptions(createInboundEmail());

    expect(webhookDeliveryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundEmailId: 'email-1',
        subscriptionId: 'subscription-1',
        status: 'delivered',
        httpStatus: 200,
      }),
    );
    expect(webhookDeliveryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered' }),
    );
  });

  it('records failed webhook delivery evidence when the post fails', async () => {
    const error: any = new Error('Bad gateway');
    error.response = { status: 502 };
    const { service, subscriptionRepository, webhookDeliveryRepository } = createService({
      postResult: throwError(() => error),
    });

    await service.deliverToSubscriptions(createInboundEmail());

    expect(subscriptionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 1,
        totalFailures: 1,
        lastError: 'Bad gateway',
      }),
    );
    expect(webhookDeliveryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundEmailId: 'email-1',
        subscriptionId: 'subscription-1',
        status: 'failed',
        deliveredAt: null,
        httpStatus: 502,
        error: 'Bad gateway',
      }),
    );
    expect(webhookDeliveryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', httpStatus: 502 }),
    );
  });

  it('records failed webhook delivery evidence when health check rejects delivery', async () => {
    const subscription = createSubscription({
      webhookUrl: 'https://helpdesk.example.com/api/email/webhook',
    });
    const { service, webhookDeliveryRepository, httpService } = createService({
      subscriptions: [subscription],
      getResult: of({ status: 503, headers: {}, data: {} }),
    });

    await service.deliverToSubscriptions(createInboundEmail());

    expect(httpService.post).not.toHaveBeenCalled();
    expect(webhookDeliveryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundEmailId: 'email-1',
        subscriptionId: 'subscription-1',
        status: 'failed',
        deliveredAt: null,
        httpStatus: null,
        error: 'Health check failed for helpdesk, skipping delivery',
      }),
    );
  });

  it('does not record delivery evidence when filters do not match', async () => {
    const subscription = createSubscription({
      filters: { to: ['billing@example.com'] },
    });
    const { service, webhookDeliveryRepository, httpService } = createService({
      subscriptions: [subscription],
    });

    await service.deliverToSubscriptions(createInboundEmail());

    expect(httpService.post).not.toHaveBeenCalled();
    expect(webhookDeliveryRepository.create).not.toHaveBeenCalled();
    expect(webhookDeliveryRepository.save).not.toHaveBeenCalled();
  });
});
