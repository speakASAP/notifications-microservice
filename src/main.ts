/**
 * Notification Microservice Main Entry Point
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Logging middleware for debugging
  app.use((req: any, res: any, next: any) => {
    if (req.path === '/email/inbound') {
      logger.log(`[MIDDLEWARE] ${req.method} ${req.path}`, 'RequestLogger');
      logger.log(`[MIDDLEWARE] Headers: ${JSON.stringify(req.headers)}`, 'RequestLogger');
      logger.log(`[MIDDLEWARE] Body: ${JSON.stringify(req.body)}`, 'RequestLogger');
    }
    next();
  });

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = parseInt(process.env.PORT || '3368', 10);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`Notification Microservice is running on: http://localhost:${port}`);
}

bootstrap();
