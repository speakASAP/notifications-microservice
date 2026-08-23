/**
 * Delivery-guarantee tests for TelegramService.
 *
 * The defect these cover: the service sent every message with parse_mode=HTML
 * and no escaping, so a single '<' in machine-generated text (log tails,
 * kubectl output like <none>, stack traces) made Telegram reject the whole
 * body with 400 "can't parse entities". The service then returned 500 and the
 * alert was never delivered. Seven deploy-failure alerts and an Orchestrator
 * digest were lost this way between 2026-08-18 and 2026-08-19.
 *
 * The guarantee asserted here: a message is delivered even when its content is
 * not valid markup.
 */
import { of, throwError } from 'rxjs';
import { TelegramService } from './telegram.service';
import { TelegramParseMode } from '../notifications/dto/send-notification.dto';

const parseEntitiesError = (description: string) => ({
  response: { status: 400, data: { ok: false, error_code: 400, description } },
});

// HttpService.post returns an Observable, which firstValueFrom subscribes to.
// throwError defers construction, so the error surfaces on subscription rather
// than as an unhandled rejection.
const rejectWith = (err: unknown) => () => throwError(() => err);

describe('TelegramService delivery guarantee', () => {
  let service: TelegramService;
  let post: jest.Mock;
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  const okResponse = { data: { result: { message_id: 42 } } };
  const sentPayloads = () => post.mock.calls.map((c) => c[1]);

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    // firstValueFrom accepts a promise-like, so each call returns a promise.
    post = jest.fn().mockImplementation(() => of(okResponse));
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service = new TelegramService({ post } as any, logger as any);
  });

  const send = (overrides: Record<string, unknown> = {}) =>
    service.send({ chatId: '694579866', message: 'hello', ...overrides } as any);

  describe('default parse mode', () => {
    it('omits parse_mode entirely so raw text cannot be rejected', async () => {
      await send({ message: 'error: <deployment> not found, image=<none>' });

      expect(sentPayloads()[0]).not.toHaveProperty('parse_mode');
      expect(sentPayloads()[0].text).toBe('error: <deployment> not found, image=<none>');
    });

    it('still honours an explicit markup request', async () => {
      await send({ parseMode: TelegramParseMode.HTML, message: '<b>Digest</b>' });

      expect(sentPayloads()[0].parse_mode).toBe('HTML');
      expect(sentPayloads()[0].text).toBe('<b>Digest</b>');
    });
  });

  describe('plain-text retry', () => {
    it('delivers the message when Telegram rejects the caller markup', async () => {
      post
        .mockImplementationOnce(rejectWith(
          parseEntitiesError('Bad Request: can\'t parse entities: Unsupported start tag "deployment"'),
        ))
        .mockImplementationOnce(() => of(okResponse));

      const result = await send({
        parseMode: TelegramParseMode.HTML,
        message: '<b>Newly failing — error: <deployment> missing</b>',
      });

      expect(result.success).toBe(true);
      expect(post).toHaveBeenCalledTimes(2);
      // The retry must drop parse_mode, or it would fail identically.
      expect(sentPayloads()[1]).not.toHaveProperty('parse_mode');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('preserves the inline keyboard on the retry', async () => {
      const keyboard = [[{ text: 'Open', url: 'https://example.invalid' }]];
      post
        .mockImplementationOnce(rejectWith(
          parseEntitiesError("Bad Request: can't parse entities: Unexpected end tag"),
        ))
        .mockImplementationOnce(() => of(okResponse));

      await send({ parseMode: TelegramParseMode.HTML, message: '</div>', inlineKeyboard: keyboard });

      expect(sentPayloads()[1].reply_markup).toEqual({ inline_keyboard: keyboard });
    });

    it('does NOT retry a non-parse failure', async () => {
      const outage = { response: { status: 502, data: { description: 'Bad Gateway' } } };
      post.mockImplementationOnce(rejectWith(outage));

      await expect(send({ parseMode: TelegramParseMode.HTML })).rejects.toThrow();
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry when the send was already plain text', async () => {
      post.mockImplementationOnce(rejectWith(
        parseEntitiesError("Bad Request: can't parse entities: whatever"),
      ));

      await expect(send()).rejects.toThrow();
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('surfaces the failure when even the plain-text retry fails', async () => {
      post
        .mockImplementationOnce(rejectWith(
          parseEntitiesError("Bad Request: can't parse entities: Unexpected end tag"),
        ))
        .mockImplementationOnce(rejectWith(new Error('network down')));

      await expect(send({ parseMode: TelegramParseMode.HTML })).rejects.toThrow(/network down/);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('length limit', () => {
    it('truncates rather than letting Telegram reject an over-long body', async () => {
      await send({ message: 'x'.repeat(5000) });

      const text = sentPayloads()[0].text;
      expect(text.length).toBeLessThanOrEqual(4096);
      expect(text.endsWith('[... truncated]')).toBe(true);
    });

    it('leaves a message at the limit untouched', async () => {
      await send({ message: 'y'.repeat(4096) });

      expect(sentPayloads()[0].text).toBe('y'.repeat(4096));
    });
  });

  describe('escapeHtml', () => {
    it('escapes & before < and > so entities are not double-escaped', () => {
      expect(TelegramService.escapeHtml('A & B <tag> C')).toBe('A &amp; B &lt;tag&gt; C');
    });
  });
});
