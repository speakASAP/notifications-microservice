/**
 * Logger Service for Auth Microservice
 * Integrates with external centralized logging microservice with fallback to local logging
 */

import { Injectable, LoggerService as NestLoggerService, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logDir: string;
  private loggingServiceUrl: string | undefined;
  private loggingServiceToken: string | undefined;
  /** Throttles the ingest-failure warning so a persistent 401 cannot flood stdout. */
  private lastIngestFailureReportMs = 0;
  private readonly serviceName = 'notifications-microservice';
  private readonly httpTimeout = 5000; // 5 seconds

  constructor(
    @Inject(HttpService)
    private readonly httpService: HttpService,
  ) {
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this.loggingServiceUrl = process.env.LOGGING_SERVICE_URL;
    this.loggingServiceToken = process.env.LOGGING_SERVICE_TOKEN?.trim() || undefined;
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  static redactSensitive(value: string): string {
    return value
      .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
      .replace(
        /((?:access_token|refresh_token|accessToken|refreshToken|token|code|client_secret|clientSecret|password)=)[^&#\s]+/gi,
        '$1[REDACTED]',
      )
      .replace(
        /("(?:access_token|refresh_token|accessToken|refreshToken|token|code|client_secret|clientSecret|password|authorization|x-internal-service-token)"\s*:\s*")[^"]*(")/gi,
        '$1[REDACTED]$2',
      )
      .replace(/\b(Authorization:\s*Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(/\b(Bearer\s+)eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '$1[REDACTED_JWT]');
  }

  private redact(value?: string): string | undefined {
    return value === undefined ? undefined : LoggerService.redactSensitive(value);
  }

  /**
   * Send log to external logging microservice (non-blocking)
   * Falls back to local logging if service is unavailable
   */
  private async sendToLoggingService(
    level: string,
    message: string,
    context?: string,
    trace?: string,
  ): Promise<void> {
    // If logging service URL is not configured, skip external logging
    if (!this.loggingServiceUrl) {
      return;
    }

    try {
      const metadata: Record<string, unknown> = {};
      const safeContext = this.redact(context);
      const safeTrace = this.redact(trace);
      const safeMessage = this.redact(message) || '';

      if (safeContext) {
        metadata.context = safeContext;
      }
      if (safeTrace) {
        metadata.trace = safeTrace;
      }

      const logPayload = {
        level,
        message: safeMessage,
        service: this.serviceName,
        timestamp: new Date().toISOString(),
        ...(Object.keys(metadata).length > 0 && { metadata }),
      };

      // Send to logging service (non-blocking, fire-and-forget)
      firstValueFrom(
        this.httpService.post(`${this.loggingServiceUrl}/api/logs`, logPayload, {
          timeout: this.httpTimeout,
          headers: {
            'Content-Type': 'application/json',
            // Ingest requires a credential since 2026-07-06. Omit the header
            // entirely when unset rather than sending "Bearer undefined".
            ...(this.loggingServiceToken
              ? { Authorization: `Bearer ${this.loggingServiceToken}` }
              : {}),
          },
        }),
      ).catch((error) => {
        this.reportIngestFailure(error);
      });
    } catch (error) {
      this.reportIngestFailure(error);
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error(`Error sending log to logging service: ${error}`);
      }
    }
  }

  /**
   * Write log to local files (fallback mechanism)
   */
  private writeLog(level: string, message: string, context?: string) {
    const timestamp = this.formatTimestamp();
    const safeContext = this.redact(context);
    const safeMessage = this.redact(message) || '';
    const logLine = `[${timestamp}] [${level.toUpperCase()}]${safeContext ? ` [${safeContext}]` : ''} ${safeMessage}\n`;
    const logFile = path.join(this.logDir, `${level}.log`);
    const allLogFile = path.join(this.logDir, 'all.log');

    try {
      fs.appendFileSync(logFile, logLine, 'utf8');
      fs.appendFileSync(allLogFile, logLine, 'utf8');
    } catch (error) {
      // Last resort: log to console if file writing fails
      // eslint-disable-next-line no-console
      console.error(`Failed to write log to file: ${error}`);
    }
  }

  log(message: string, context?: string) {
    const safeMessage = this.redact(message) || '';
    const safeContext = this.redact(context);

    // Send to external logging service (non-blocking)
    this.sendToLoggingService('info', safeMessage, safeContext).catch(() => {
      // Error already handled in sendToLoggingService
    });

    // Always write to local files as fallback
    this.writeLog('info', safeMessage, safeContext);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(safeMessage, safeContext || '');
    }
  }

  error(message: string, trace?: string, context?: string) {
    const safeMessage = this.redact(message) || '';
    const safeTrace = this.redact(trace);
    const safeContext = this.redact(context);
    const fullMessage = `${safeMessage}${safeTrace ? `\n${safeTrace}` : ''}`;

    // Send to external logging service (non-blocking)
    this.sendToLoggingService('error', safeMessage, safeContext, safeTrace).catch(() => {
      // Error already handled in sendToLoggingService
    });

    // Always write to local files as fallback
    this.writeLog('error', fullMessage, safeContext);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error(safeMessage, safeTrace || '', safeContext || '');
    }
  }

  warn(message: string, context?: string) {
    const safeMessage = this.redact(message) || '';
    const safeContext = this.redact(context);

    // Send to external logging service (non-blocking)
    this.sendToLoggingService('warn', safeMessage, safeContext).catch(() => {
      // Error already handled in sendToLoggingService
    });

    // Always write to local files as fallback
    this.writeLog('warn', safeMessage, safeContext);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn(safeMessage, safeContext || '');
    }
  }

  debug(message: string, context?: string) {
    const safeMessage = this.redact(message) || '';
    const safeContext = this.redact(context);

    // Send to external logging service (non-blocking)
    this.sendToLoggingService('debug', safeMessage, safeContext).catch(() => {
      // Error already handled in sendToLoggingService
    });

    // Always write to local files as fallback
    this.writeLog('debug', safeMessage, safeContext);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug(safeMessage, safeContext || '');
    }
  }

  verbose(message: string, context?: string) {
    this.debug(message, context);
  }

  /**
   * Report a failed log shipment. Never silent: a rejected ingest means this
   * service is losing logs, which is exactly how the 2026-07-06 outage stayed
   * invisible for six weeks. Throttled to once a minute so a persistent 401
   * cannot flood stdout, and the credential value is never printed.
   */
  private reportIngestFailure(error: unknown): void {
    const now = Date.now();
    if (now - this.lastIngestFailureReportMs < 60_000) return;
    this.lastIngestFailureReportMs = now;

    const err = error as { message?: string; response?: { status?: number } };
    const status = err?.response?.status;
    const hint = status === 401 || status === 403
      ? 'LOGGING_SERVICE_TOKEN is missing or not accepted — logs are being dropped.'
      : 'Logging service unreachable — logs are being dropped.';

    // eslint-disable-next-line no-console
    console.error(JSON.stringify({
      level: 'error',
      event: 'log_ingest_failed',
      service: this.serviceName,
      status: status ?? null,
      message: LoggerService.redactSensitive(String(err?.message ?? error)),
      hint,
      timestamp: new Date().toISOString(),
      duration_ms: 0,
    }));
  }
}
