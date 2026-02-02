/**
 * Notification Microservice App Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { ConfigModule as ApiConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { InfoController } from './info/info.controller';
import { DatabaseModule } from '../shared/database/database.module';
import { LoggerModule } from '../shared/logger/logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    LoggerModule,
    NotificationsModule,
    AdminModule,
    ApiConfigModule,
  ],
  controllers: [HealthController, InfoController],
  providers: [],
})
export class AppModule {}
