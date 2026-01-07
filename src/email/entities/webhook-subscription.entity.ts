import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Webhook subscription entity for inbound email notifications.
 * Services can subscribe to receive inbound emails via webhooks.
 */
@Entity('webhook_subscriptions')
export class WebhookSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, name: 'serviceName' })
  @Index()
  serviceName: string; // e.g., 'helpdesk', 'crm', 'analytics'

  @Column({ type: 'varchar', length: 500, name: 'webhook_url' })
  webhookUrl: string; // URL where webhooks will be sent

  @Column({ type: 'varchar', length: 100, nullable: true })
  secret: string | null; // Secret for webhook signature verification

  @Column({ type: 'jsonb', nullable: true })
  filters: any | null; // Filters for which emails to forward (e.g., { to: ['support@example.com'] })

  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index()
  status: 'active' | 'inactive' | 'suspended';

  @Column({ type: 'int', default: 0, name: 'retryCount' })
  retryCount: number; // Number of retries for failed deliveries

  @Column({ type: 'int', default: 3, name: 'max_retries' })
  maxRetries: number; // Maximum retries before suspending

  @Column({ type: 'timestamp', nullable: true, name: 'last_delivery_at' })
  lastDeliveryAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'last_error_at' })
  lastErrorAt: Date | null;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError: string | null;

  @Column({ type: 'int', default: 0, name: 'total_deliveries' })
  totalDeliveries: number; // Total successful deliveries

  @Column({ type: 'int', default: 0, name: 'total_failures' })
  totalFailures: number; // Total failed deliveries

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
