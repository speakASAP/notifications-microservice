/**
 * Notification Entity
 * Database entity for storing notification records
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum NotificationChannel {
  EMAIL = 'email',
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
}

export enum NotificationType {
  ORDER_CONFIRMATION = 'order_confirmation',
  PAYMENT_CONFIRMATION = 'payment_confirmation',
  ORDER_STATUS_UPDATE = 'order_status_update',
  SHIPMENT_TRACKING = 'shipment_tracking',
  CUSTOM = 'custom',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 20,
  })
  channel: NotificationChannel;

  @Column({
    type: 'varchar',
    length: 50,
  })
  type: NotificationType;

  @Column({
    type: 'varchar',
    length: 255,
  })
  @Index('idx_notifications_recipient')
  recipient: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  subject: string | null;

  @Column({
    type: 'text',
  })
  message: string;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  templateData: Record<string, any> | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationStatus.PENDING,
  })
  @Index('idx_notifications_status')
  status: NotificationStatus;

  @Column({
    type: 'text',
    nullable: true,
  })
  error: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  messageId: string | null;

  @CreateDateColumn()
  @Index('idx_notifications_created_at')
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

