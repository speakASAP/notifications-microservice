/**
 * Unit tests for InboundEmailController
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { InboundEmailController } from './inbound-email.controller';
import { InboundEmailService } from './inbound-email.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { LoggerService } from '../../shared/logger/logger.service';

describe('InboundEmailController', () => {
  let controller: InboundEmailController;
  let inboundEmailService: {
    handleSNSNotification: jest.Mock;
    findInboundEmails: jest.Mock;
  };
  let webhookDeliveryService: {
    confirmDelivery: jest.Mock;
    confirmDeliveryByInboundEmailIdOnly: jest.Mock;
  };
  let logger: { log: jest.Mock; error: jest.Mock; warn: jest.Mock };

  beforeEach(async () => {
    inboundEmailService = {
      handleSNSNotification: jest.fn(),
      findInboundEmails: jest.fn().mockResolvedValue([]),
    };
    webhookDeliveryService = {
      confirmDelivery: jest.fn(),
      confirmDeliveryByInboundEmailIdOnly: jest.fn(),
    };
    logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InboundEmailController],
      providers: [
        { provide: InboundEmailService, useValue: inboundEmailService },
        { provide: WebhookDeliveryService, useValue: webhookDeliveryService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    controller = module.get<InboundEmailController>(InboundEmailController);
  });

  describe('handleInbound', () => {
    it('returns error when req.body is missing', async () => {
      const req = { method: 'POST', url: '/email/inbound', body: undefined, headers: {} } as unknown as Request;
      const headers: Record<string, string | string[] | undefined> = {};

      const result = await controller.handleInbound(req, headers);

      expect(result).toEqual({
        status: 'ignored',
        message: 'S3-only mode: SES notifications not processed. Use /email/inbound/s3 for S3 events.',
      });
      expect(inboundEmailService.handleSNSNotification).not.toHaveBeenCalled();
    });

    it('returns error when req.body is null', async () => {
      const req = { method: 'POST', url: '/email/inbound', body: null, headers: {} } as unknown as Request;
      const headers: Record<string, string | string[] | undefined> = {};

      const result = await controller.handleInbound(req, headers);

      expect(result).toEqual({
        status: 'ignored',
        message: 'S3-only mode: SES notifications not processed. Use /email/inbound/s3 for S3 events.',
      });
      expect(inboundEmailService.handleSNSNotification).not.toHaveBeenCalled();
    });
  });

  describe('getInboundEmails', () => {
    it('uses safeLimit 100 when limit is invalid (NaN)', async () => {
      await controller.getInboundEmails('abc', undefined, undefined, undefined);

      expect(inboundEmailService.findInboundEmails).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('uses safeLimit 100 when limit is negative', async () => {
      await controller.getInboundEmails('-5', undefined, undefined, undefined);

      expect(inboundEmailService.findInboundEmails).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('clamps limit to 500 when > 500', async () => {
      await controller.getInboundEmails('9999', undefined, undefined, undefined);

      expect(inboundEmailService.findInboundEmails).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 }),
      );
    });

    it('uses limit when valid (e.g. 50)', async () => {
      await controller.getInboundEmails('50', undefined, undefined, undefined);

      expect(inboundEmailService.findInboundEmails).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });

    it('uses default 100 when limit is not provided', async () => {
      await controller.getInboundEmails(undefined, undefined, undefined, undefined);

      expect(inboundEmailService.findInboundEmails).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });
  });

  describe('deliveryConfirmation', () => {
    it('returns success when the confirmation was recorded', async () => {
      webhookDeliveryService.confirmDeliveryByInboundEmailIdOnly.mockResolvedValue({
        success: true,
        message: 'Delivery confirmed for helpdesk',
      });

      const result = await controller.deliveryConfirmation({
        inboundEmailId: 'email-1',
        status: 'delivered',
      });

      expect(result).toEqual({ success: true, message: 'Delivery confirmed for helpdesk' });
    });

    // A 200 here told the caller the email was settled while GET /email/inbound kept
    // returning it, so the same mail was polled and re-confirmed indefinitely.
    it('fails with 503 when the confirmation could not be recorded', async () => {
      webhookDeliveryService.confirmDeliveryByInboundEmailIdOnly.mockResolvedValue({
        success: false,
        message: 'No active helpdesk subscription',
      });

      await expect(
        controller.deliveryConfirmation({ inboundEmailId: 'email-1', status: 'delivered' }),
      ).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        response: { success: false, message: 'No active helpdesk subscription' },
      });
    });

    it('does not convert a deliberate HTTP failure into a 200 response', async () => {
      webhookDeliveryService.confirmDeliveryByInboundEmailIdOnly.mockResolvedValue({
        success: false,
        message: 'No active helpdesk subscription',
      });

      const error = await controller
        .deliveryConfirmation({ inboundEmailId: 'email-1', status: 'delivered' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
    });

    it('still reports unexpected errors as a plain failure body', async () => {
      webhookDeliveryService.confirmDeliveryByInboundEmailIdOnly.mockRejectedValue(
        new Error('database unreachable'),
      );

      const result = await controller.deliveryConfirmation({
        inboundEmailId: 'email-1',
        status: 'delivered',
      });

      expect(result).toEqual({ success: false, message: 'database unreachable' });
    });
  });
});
