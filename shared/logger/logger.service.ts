/**
 * Logger Service for Notification Microservice
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
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString();
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
      if (context) {
        metadata.context = context;
      }
      if (trace) {
        metadata.trace = trace;
      }

      const logPayload = {
        level,
        message,
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
          },
        }),
      ).catch((error) => {
        // Silently fail - fallback to local logging will handle it
        // Only log to console in development to avoid infinite loops
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error(`Failed to send log to logging service: ${error.message}`);
        }
      });
    } catch (error) {
      // Silently fail - fallback to local logging will handle it
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
    const logLine = `[${timestamp}] [${level.toUpperCase()}]${context ? ` [${context}]` : ''} ${message}\n`;
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
    // Send to external logging service (non-blocking)
    this.sendToLoggingService('info', message, context).catch(() => {
      // Error already handled in sendToLoggingService
    });

    // Always write to local files as fallback
    this.writeLog('info', message, context);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(message, context || '');
    }
  }

  error(message: string, trace?: string, context?: string) {
    const fullMessage = `${message}${trace ? `\n${trace}` : ''}`;

    // Send to external logging service (non-blocking)
    this.sendToLoggingService('error', message, context, trace).catch(() => {
      // Error already handled in sendToLoggingService
    });

    // Always write to local files as fallback
    this.writeLog('error', fullMessage, context);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error(message, trace || '', context || '');
    }
  }

  warn(message: string, context?: string) {
    // Send to external logging service (non-blocking)
    this.sendToLoggingService('warn', message, context).catch(() => {
      // Error already handled in sendToLoggingService
    });

    // Always write to local files as fallback
    this.writeLog('warn', message, context);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn(message, context || '');
    }
  }

  debug(message: string, context?: string) {
    // Send to external logging service (non-blocking)
    this.sendToLoggingService('debug', message, context).catch(() => {
      // Error already handled in sendToLoggingService
    });

    // Always write to local files as fallback
    this.writeLog('debug', message, context);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug(message, context || '');
    }
  }

  verbose(message: string, context?: string) {
    this.debug(message, context);
  }
}

