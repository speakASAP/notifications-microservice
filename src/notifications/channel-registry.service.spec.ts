import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChannelRegistryService } from './channel-registry.service';
import { ChannelRegistry, ChannelRegistryProvider, ChannelRegistryType } from './entities/channel-registry.entity';
import {
  EmailProvider,
  NotificationChannel,
  NotificationType,
  SendNotificationDto,
} from './dto/send-notification.dto';

function createInvoicesChannel(overrides: Partial<ChannelRegistry> = {}): ChannelRegistry {
  return {
    id: 'channel-1',
    channelKey: 'invoices.documents',
    type: ChannelRegistryType.EMAIL,
    provider: ChannelRegistryProvider.SES,
    domain: null,
    fromEmail: null,
    fromName: null,
    replyToEmail: null,
    purposesAllowed: ['transactional'],
    applicationsAllowed: ['invoices-microservice'],
    isActive: true,
    fallbackChannelKey: null,
    createdAt: new Date('2026-07-02T00:00:00.000Z'),
    updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    createdBy: 'runtime-provisioning',
    updatedBy: 'runtime-provisioning',
    ...overrides,
  } as ChannelRegistry;
}

function createDto(overrides: Partial<SendNotificationDto> = {}): SendNotificationDto {
  return {
    channel: NotificationChannel.EMAIL,
    type: NotificationType.ORDER_CONFIRMATION,
    recipient: 'invoice-smoke@example.invalid',
    subject: 'Proforma invoice PF-2026-0001',
    message: 'Proforma invoice PF-2026-0001 is ready: https://invoices.alfares.cz/documents/example.html?token=example',
    service: 'invoices-microservice',
    purpose: 'transactional',
    channelKey: 'invoices.documents',
    templateData: {
      invoice: {
        id: 'invoice-1',
        type: 'proforma',
        invoiceNumber: 'PF-2026-0001',
        orderId: 'order-1',
      },
    },
    ...overrides,
  };
}

function createService(channel: ChannelRegistry | null) {
  const repository = {
    findOne: jest.fn(async () => channel),
    find: jest.fn(),
    save: jest.fn(),
  };
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const service = new ChannelRegistryService(repository as any, logger as any);
  return { service, repository, logger };
}

describe('ChannelRegistryService invoices.documents contract', () => {
  it('resolves the invoice document channel for invoices transactional delivery', async () => {
    const { service, repository } = createService(createInvoicesChannel());

    const result = await service.resolveSendPolicy(createDto());

    expect(repository.findOne).toHaveBeenCalledWith({ where: { channelKey: 'invoices.documents' } });
    expect(result.decisionReason).toBe('channel_key_resolved');
    expect(result.dto).toMatchObject({
      channel: NotificationChannel.EMAIL,
      emailProvider: EmailProvider.SES,
      service: 'invoices-microservice',
      purpose: 'transactional',
      channelKey: 'invoices.documents',
    });
  });

  it('rejects invoices.documents when the caller is not invoices-microservice', async () => {
    const { service } = createService(createInvoicesChannel());

    await expect(
      service.resolveSendPolicy(createDto({ service: 'orders-microservice' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invoices.documents for non-transactional purposes', async () => {
    const { service } = createService(createInvoicesChannel());

    await expect(
      service.resolveSendPolicy(createDto({ purpose: 'marketing' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('fails closed until the invoices.documents channel row exists', async () => {
    const { service } = createService(null);

    await expect(service.resolveSendPolicy(createDto())).rejects.toThrow(NotFoundException);
  });
});
