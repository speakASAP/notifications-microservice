/**
 * Startup validation for the per-caller service tokens.
 *
 * Regression guard for the 2026-08-13 incident: SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN was
 * missing from Vault for ~2 days. Because JwtRolesGuard checks `if (token && safeEqual(...))`,
 * an unset variable silently skipped that caller's branch instead of erroring — the
 * misconfiguration surfaced as "unknown caller" 401s rather than as a broken deployment.
 */

import { assertServiceTokensConfigured, REQUIRED_SERVICE_TOKEN_VARS } from './service-tokens.config';

describe('assertServiceTokensConfigured', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of REQUIRED_SERVICE_TOKEN_VARS) {
      saved[name] = process.env[name];
      process.env[name] = `${name}-value`;
    }
  });

  afterEach(() => {
    for (const name of REQUIRED_SERVICE_TOKEN_VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('passes when every required service token is set', () => {
    expect(() => assertServiceTokensConfigured()).not.toThrow();
  });

  it('throws when a required service token is missing', () => {
    delete process.env.SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN;

    expect(() => assertServiceTokensConfigured()).toThrow(
      /SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN/,
    );
  });

  it('throws when a required service token is present but empty', () => {
    // The guard's `if (token && ...)` treats '' exactly like unset, so '' must fail too.
    process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN = '';

    expect(() => assertServiceTokensConfigured()).toThrow(
      /CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN/,
    );
  });

  it('throws when a token is only whitespace', () => {
    process.env.INVOICES_NOTIFICATIONS_SERVICE_TOKEN = '   ';

    expect(() => assertServiceTokensConfigured()).toThrow(
      /INVOICES_NOTIFICATIONS_SERVICE_TOKEN/,
    );
  });

  it('names every missing variable, not just the first', () => {
    delete process.env.CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN;

    let message = '';
    try {
      assertServiceTokensConfigured();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    expect(message).toContain('CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN');
    expect(message).toContain('SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN');
  });

  it('never puts a token value in the error message', () => {
    process.env.SERVICE_TOKEN = 'super-secret-value';
    delete process.env.SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN;

    let message = '';
    try {
      assertServiceTokensConfigured();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    expect(message).not.toContain('super-secret-value');
  });

  it('covers exactly the tokens JwtRolesGuard resolves', () => {
    expect([...REQUIRED_SERVICE_TOKEN_VARS].sort()).toEqual([
      'CLIPLOT_NOTIFICATIONS_SERVICE_TOKEN',
      'CV_TUNING_NOTIFICATIONS_SERVICE_TOKEN',
      'INVOICES_NOTIFICATIONS_SERVICE_TOKEN',
      'SERVICE_TOKEN',
      'SPEAKASAP_NOTIFICATIONS_SERVICE_TOKEN',
    ]);
  });
});
