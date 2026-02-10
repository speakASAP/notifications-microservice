/**
 * Webhook delivery entity: per-email, per-subscription delivery tracking.
 * Used to guarantee and confirm delivery to helpdesk (or other subscribers).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { InboundEmail } from './inbound-email.entity';
import { WebhookSubscription } from './webhook-subscription.entity';

export type WebhookDeliveryStatus = 'sent' | 'delivered' | 'failed';

@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'inbound_email_id' })
  @Index('idx_webhook_deliveries_inbound_email_id')
  inboundEmailId: string;

  @Column({ type: 'uuid', name: 'subscription_id' })
  @Index('idx_webhook_deliveries_subscription_id')
  subscriptionId: string;

  @Column({ type: 'varchar', length: 20, default: 'sent' })
  @Index('idx_webhook_deliveries_status')
  status: WebhookDeliveryStatus;

  @Column({ type: 'int', nullable: true, name: 'http_status' })
  httpStatus: number | null;

  @Column({ type: 'timestamp', nullable: true, name: 'delivered_at' })
  deliveredAt: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'ticket_id' })
  ticketId: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'comment_id' })
  commentId: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => InboundEmail, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inbound_email_id' })
  inboundEmail?: InboundEmail;

  @ManyToOne(() => WebhookSubscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: WebhookSubscription;
}
