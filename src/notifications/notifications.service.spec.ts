import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  EmailProvider,
  NotificationChannel,
  NotificationType,
  SendNotificationDto,
} from './dto/send-notification.dto';

function buildService() {
  const notificationRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const emailService = {
    send: jest.fn(),
  };
  const telegramService = {
    send: jest.fn(),
  };
  const whatsappService = {
    send: jest.fn(),
  };
  const channelRegistryService = {
    resolveSendPolicy: jest.fn(async (dto: SendNotificationDto) => ({
      dto,
      decisionReason: dto.channelKey ? 'channel_key_resolved' : 'legacy_fallback_no_channel_key',
    })),
  };
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const service = new NotificationsService(
    notificationRepository as any,
    emailService as any,
    telegramService as any,
    whatsappService as any,
    channelRegistryService as any,
    logger as any,
  );

  return {
    service,
    notificationRepository,
    emailService,
    telegramService,
    whatsappService,
    channelRegistryService,
  };
}

describe('NotificationsService validateSend', () => {
  const cliplotPayload: SendNotificationDto = {
    channel: NotificationChannel.EMAIL,
    type: NotificationType.ORDER_CONFIRMATION,
    recipient: 'smoke@example.invalid',
    subject: 'Potvrzení objednávky cliplot-smoke - Cliplot',
    message: 'Dobrý den, Smoke Test,\n\nDěkujeme za objednávku.',
    templateData: {
      orderId: 'cliplot-smoke',
      customerName: 'Smoke Test',
      total: 1590,
      currency: 'CZK',
    },
    service: 'cliplot',
    purpose: 'transactional',
    emailProvider: EmailProvider.AUTO,
  };

  it('validates a Cliplot order confirmation without saving or sending', async () => {
    const {
      service,
      notificationRepository,
      emailService,
      telegramService,
      whatsappService,
      channelRegistryService,
    } = buildService();

    const result = await service.validateSend(cliplotPayload);

    expect(result).toMatchObject({
      valid: true,
      mutation: false,
      providerCall: false,
      channel: NotificationChannel.EMAIL,
      recipient: 'smoke@example.invalid',
      type: NotificationType.ORDER_CONFIRMATION,
      subject: 'Potvrzení objednávky cliplot-smoke - Cliplot',
      service: 'cliplot',
      purpose: 'transactional',
      decisionReason: 'legacy_fallback_no_channel_key',
      emailProvider: EmailProvider.AUTO,
    });
    expect(result.messageLength).toBeGreaterThan(0);
    expect(channelRegistryService.resolveSendPolicy).toHaveBeenCalledWith(cliplotPayload);
    expect(notificationRepository.findOne).not.toHaveBeenCalled();
    expect(notificationRepository.create).not.toHaveBeenCalled();
    expect(notificationRepository.save).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
    expect(telegramService.send).not.toHaveBeenCalled();
    expect(whatsappService.send).not.toHaveBeenCalled();
  });

  it('rejects missing required fields before channel policy or provider calls', async () => {
    const {
      service,
      notificationRepository,
      emailService,
      telegramService,
      whatsappService,
      channelRegistryService,
    } = buildService();

    await expect(service.validateSend({} as SendNotificationDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(channelRegistryService.resolveSendPolicy).not.toHaveBeenCalled();
    expect(notificationRepository.save).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
    expect(telegramService.send).not.toHaveBeenCalled();
    expect(whatsappService.send).not.toHaveBeenCalled();
  });
});
