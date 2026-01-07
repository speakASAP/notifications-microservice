/**
 * Database Module for Notification Microservice
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../src/notifications/entities/notification.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'db-server-postgres',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'dbadmin',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'notifications',
      entities: [Notification],
      migrations: ['dist/src/migrations/*.js'],
      migrationsRun: process.env.RUN_MIGRATIONS === 'true',
      synchronize: process.env.DB_SYNC === 'true',
      logging: process.env.NODE_ENV === 'development',
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

