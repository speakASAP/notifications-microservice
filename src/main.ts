/**
 * Notification Microservice Main Entry Point
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import { AppDataSource } from './data-source';

async function bootstrap() {
  // Run pending migrations at startup (single deploy step; no separate migration container)
  const logger = new Logger('Bootstrap');
  try {
    await AppDataSource.initialize();
    const run = await AppDataSource.runMigrations();
    await AppDataSource.destroy();
    if (run.length > 0) {
      logger.log(`Ran ${run.length} migration(s): ${run.map((m) => m.name).join(', ')}`);
    }
  } catch (err) {
    logger.error('Migration failed at startup', err instanceof Error ? err.stack : String(err));
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    rawBody: true,
  });

  // Serve web interface (landing + admin) - static files first so API routes still work
  const webPath = path.join(process.cwd(), 'web');
  app.use(express.static(webPath));

  // Configure body parser to handle text/plain as JSON (for AWS SNS)
  app.use(express.text({ type: 'text/plain' }));
  app.use((req: any, res: any, next: any) => {
    // If content-type is text/plain, parse as JSON (for both /email/inbound and /email/inbound/s3)
    if ((req.path === '/email/inbound' || req.path === '/email/inbound/s3') && req.headers['content-type']?.includes('text/plain')) {
      try {
        if (typeof req.body === 'string') {
          req.body = JSON.parse(req.body);
        }
      } catch (e) {
        logger.error(`Failed to parse text/plain body as JSON: ${e}`, 'RequestLogger');
      }
    }
    next();
  });

  // Logging middleware for debugging
  app.use((req: any, res: any, next: any) => {
    if (req.path === '/email/inbound' || req.path === '/email/inbound/s3') {
      logger.log(`[MIDDLEWARE] ${req.method} ${req.path}`, 'RequestLogger');
      logger.log(`[MIDDLEWARE] Headers: ${JSON.stringify(req.headers)}`, 'RequestLogger');
      logger.log(`[MIDDLEWARE] Body: ${JSON.stringify(req.body)}`, 'RequestLogger');
      logger.log(`[MIDDLEWARE] Body type: ${typeof req.body}`, 'RequestLogger');
    }
    next();
  });

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global validation pipe - configured to allow extra fields
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false, // Don't strip extra fields
      forbidNonWhitelisted: false, // Allow AWS SNS messages with extra fields
      transform: false, // Don't transform - we handle parsing manually
      skipMissingProperties: true,
      skipNullProperties: true,
      skipUndefinedProperties: true,
    }),
  );

  const port = parseInt(process.env.PORT || '3368', 10);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`Notification Microservice is running on: http://localhost:${port}`);
}

bootstrap();
