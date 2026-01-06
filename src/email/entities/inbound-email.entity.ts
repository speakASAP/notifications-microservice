/**
 * Inbound Email Entity
 * Database entity for storing inbound emails received via AWS SES SNS webhook
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('inbound_emails')
export class InboundEmail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  @Index('idx_inbound_emails_from')
  from: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  @Index('idx_inbound_emails_to')
  to: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  subject: string | null;

  @Column({
    type: 'text',
  })
  bodyText: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  bodyHtml: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  attachments: any[] | null;

  @CreateDateColumn()
  @Index('idx_inbound_emails_received_at')
  receivedAt: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  processedAt: Date | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  @Index('idx_inbound_emails_status')
  status: string; // pending, processed, failed

  @Column({
    type: 'text',
    nullable: true,
  })
  error: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  rawData: any | null; // Store raw SNS/SES notification for debugging
}
