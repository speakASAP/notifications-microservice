import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Webhook subscription entity for inbound email notifications.
 * Services can subscribe to receive inbound emails via webhooks.
 */
@Entity('webhook_subscriptions')
export class WebhookSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  serviceName: string; // e.g., 'helpdesk', 'crm', 'analytics'

  @Column({ type: 'varchar', length: 500 })
  webhookUrl: string; // URL where webhooks will be sent

  @Column({ type: 'varchar', length: 100, nullable: true })
  secret: string | null; // Secret for webhook signature verification

  @Column({ type: 'jsonb', nullable: true })
  filters: any | null; // Filters for which emails to forward (e.g., { to: ['support@example.com'] })

  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index()
  status: 'active' | 'inactive' | 'suspended';

  @Column({ type: 'int', default: 0 })
  retryCount: number; // Number of retries for failed deliveries

  @Column({ type: 'int', default: 3 })
  maxRetries: number; // Maximum retries before suspending

  @Column({ type: 'timestamp', nullable: true })
  lastDeliveryAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastErrorAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'int', default: 0 })
  totalDeliveries: number; // Total successful deliveries

  @Column({ type: 'int', default: 0 })
  totalFailures: number; // Total failed deliveries

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
