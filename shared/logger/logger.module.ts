/**
 * Logger Module for Notification Microservice
 */

import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LoggerService } from './logger.service';

@Global()
@Module({
  imports: [HttpModule],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}

