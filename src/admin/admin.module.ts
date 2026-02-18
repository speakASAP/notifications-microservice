/**
 * Admin Module
 * Admin panel API: stats, history, service params (JWT protected)
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AdminController } from './admin.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    HttpModule.register({ timeout: 10000 }),
    NotificationsModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
