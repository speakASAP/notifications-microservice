/**
 * Notification Microservice App Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { ConfigModule as ApiConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { InfoController } from './info/info.controller';
import { DatabaseModule } from '../shared/database/database.module';
import { LoggerModule } from '../shared/logger/logger.module';
import { AuthModule } from './auth/auth.module';
import { JwtRolesGuard } from './auth/jwt-roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    DatabaseModule,
    LoggerModule,
    NotificationsModule,
    AdminModule,
    ApiConfigModule,
  ],
  controllers: [HealthController, InfoController],
  providers: [
    { provide: APP_GUARD, useClass: JwtRolesGuard },
  ],
})
export class AppModule {}
