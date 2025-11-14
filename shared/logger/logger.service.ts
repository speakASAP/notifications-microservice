/**
 * Logger Service for Notification Microservice
 */

import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logDir: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  private writeLog(level: string, message: string, context?: string) {
    const timestamp = this.formatTimestamp();
    const logLine = `[${timestamp}] [${level.toUpperCase()}]${context ? ` [${context}]` : ''} ${message}\n`;
    const logFile = path.join(this.logDir, `${level}.log`);
    const allLogFile = path.join(this.logDir, 'all.log');

    fs.appendFileSync(logFile, logLine, 'utf8');
    fs.appendFileSync(allLogFile, logLine, 'utf8');
  }

  log(message: string, context?: string) {
    this.writeLog('info', message, context);
    if (process.env.NODE_ENV === 'development') {
      console.log(message, context || '');
    }
  }

  error(message: string, trace?: string, context?: string) {
    this.writeLog('error', `${message}${trace ? `\n${trace}` : ''}`, context);
    if (process.env.NODE_ENV === 'development') {
      console.error(message, trace || '', context || '');
    }
  }

  warn(message: string, context?: string) {
    this.writeLog('warn', message, context);
    if (process.env.NODE_ENV === 'development') {
      console.warn(message, context || '');
    }
  }

  debug(message: string, context?: string) {
    this.writeLog('debug', message, context);
    if (process.env.NODE_ENV === 'development') {
      console.debug(message, context || '');
    }
  }

  verbose(message: string, context?: string) {
    this.debug(message, context);
  }
}

