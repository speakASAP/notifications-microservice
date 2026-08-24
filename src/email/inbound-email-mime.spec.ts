import { InboundEmailService } from './inbound-email.service';

/**
 * Regression tests for MIME header parsing.
 *
 * A DKIM-Signature carries a signed-header list whose folded continuation line can start
 * with "content-transfer-encoding:". A bare regex over the raw header blob matched that
 * list instead of the real header, so quoted-printable bodies were never decoded and
 * reached helpdesk tickets as "=3D" noise (ticket HD-223168).
 */
describe('InboundEmailService MIME header parsing', () => {
  let service: InboundEmailService;
  const errors: string[] = [];

  const parse = (raw: string) =>
    (service as unknown as {
      parseEmailParts: (c: string) => {
        subject: string | null;
        bodyText: string;
        bodyHtml: string | null;
      };
    }).parseEmailParts(raw);

  beforeEach(() => {
    errors.length = 0;
    service = Object.create(InboundEmailService.prototype) as InboundEmailService;
    (service as unknown as { logger: unknown }).logger = {
      log: () => undefined,
      warn: () => undefined,
      error: (message: string) => {
        errors.push(message);
      },
    };
  });

  it('decodes quoted-printable when a DKIM-Signature header lists content-transfer-encoding', () => {
    const raw = [
      'Return-Path: <bounces@sendgrid.net>',
      'DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=sendgrid.net;',
      '\th=from:subject:date:mime-version:to:content-type:',
      '\tcontent-transfer-encoding:cc:content-type:date:from:subject:to;',
      '\ts=smtpapi; t=1781715882;',
      'From: Sender <sender@example.com>',
      'Subject: Missed Call Received',
      'Content-Type: text/html; charset=us-ascii',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<html><body style=3D"padding: 0px;">Caller=3D unknown, cost =3D 0=',
      '.00</body></html>',
    ].join('\r\n');

    const parts = parse(raw);

    expect(parts.bodyHtml).not.toBeNull();
    expect(parts.bodyHtml).not.toMatch(/=3D/);
    expect(parts.bodyHtml).toContain('<body style="padding: 0px;">');
    expect(parts.bodyHtml).toContain('cost = 0.00');
    expect(errors).toHaveLength(0);
  });

  it('reads the boundary from the real Content-Type header, not from a signed-header list', () => {
    const raw = [
      'DKIM-Signature: v=1; a=rsa-sha256; d=example.com;',
      '\th=content-type:content-transfer-encoding:from:to;',
      'From: Sender <sender@example.com>',
      'Content-Type: multipart/alternative; boundary="realboundary"',
      '',
      '--realboundary',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Hello =E2=82=AC world',
      '--realboundary',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<p>Hello =E2=82=AC world</p>',
      '--realboundary--',
    ].join('\r\n');

    const parts = parse(raw);

    expect(parts.bodyText.trim()).toBe('Hello € world');
    expect(parts.bodyHtml).toBe('<p>Hello € world</p>');
  });

  it('logs an error instead of silently storing a body it could not decode', () => {
    const raw = [
      'From: Sender <sender@example.com>',
      'Content-Type: text/html; charset=us-ascii',
      'Content-Transfer-Encoding: x-uuencode',
      '',
      '<p>body</p>',
    ].join('\r\n');

    const parts = parse(raw);

    expect(parts.bodyHtml).toBe('<p>body</p>');
    expect(errors.join('\n')).toContain('Unknown Content-Transfer-Encoding');
  });

  it('treats a folded header continuation as part of the previous field', () => {
    const raw = [
      'From: Sender <sender@example.com>',
      'X-SG-EID: ',
      ' =?us-ascii?Q?u001=2E6CSVcYS?=',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<p>caf=C3=A9</p>',
    ].join('\r\n');

    const parts = parse(raw);

    expect(parts.bodyHtml).toBe('<p>café</p>');
  });
});
