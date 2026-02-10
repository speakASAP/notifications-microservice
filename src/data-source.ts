import { DataSource } from 'typeorm';
import { Notification } from './notifications/entities/notification.entity';
import { InboundEmail } from './email/entities/inbound-email.entity';
import { WebhookSubscription } from './email/entities/webhook-subscription.entity';
import { WebhookDelivery } from './email/entities/webhook-delivery.entity';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'db-server-postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'dbadmin',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'notifications',
  entities: [Notification, InboundEmail, WebhookSubscription, WebhookDelivery],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
