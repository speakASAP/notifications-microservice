/**
 * Unit tests for InboundEmailController
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { InboundEmailController } from './inbound-email.controller';
import { InboundEmailService } from './inbound-email.service';
import { LoggerService } from '../../shared/logger/logger.service';

describe('InboundEmailController', () => {
  let controller: InboundEmailController;
  let inboundEmailService: {
    handleSNSNotification: jest.Mock;
    findInboundEmails: jest.Mock;
  };
  let logger: { log: jest.Mock; error: jest.Mock; warn: jest.Mock };

  beforeEach(async () => {
    inboundEmailService = {
      handleSNSNotification: jest.fn(),
      findInboundEmails: jest.fn().mockResolvedValue([]),
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
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    controller = module.get<InboundEmailController>(InboundEmailController);
  });

  describe('handleInbound', () => {
    it('returns error when req.body is missing', async () => {
      const req = { method: 'POST', url: '/email/inbound', body: undefined } as unknown as Request;
      const headers: Record<string, string | string[] | undefined> = {};

      const result = await controller.handleInbound(req, headers);

      expect(result).toEqual({ status: 'error', message: 'Request body is missing' });
      expect(inboundEmailService.handleSNSNotification).not.toHaveBeenCalled();
    });

    it('returns error when req.body is null', async () => {
      const req = { method: 'POST', url: '/email/inbound', body: null } as unknown as Request;
      const headers: Record<string, string | string[] | undefined> = {};

      const result = await controller.handleInbound(req, headers);

      expect(result).toEqual({ status: 'error', message: 'Request body is missing' });
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
});
