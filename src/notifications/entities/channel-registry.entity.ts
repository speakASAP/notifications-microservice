import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ChannelRegistryType {
  EMAIL = 'email',
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
}

export enum ChannelRegistryProvider {
  SES = 'ses',
  SENDGRID = 'sendgrid',
  TELEGRAM = 'telegram',
  META_WHATSAPP = 'meta_whatsapp',
  OTHER = 'other',
}

@Entity('channel_registry')
export class ChannelRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  @Index('idx_channel_registry_key')
  channelKey: string;

  @Column({ type: 'varchar', length: 20 })
  type: ChannelRegistryType;

  @Column({ type: 'varchar', length: 32 })
  provider: ChannelRegistryProvider;

  @Column({ type: 'varchar', length: 255, nullable: true })
  domain: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fromEmail: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fromName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  replyToEmail: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  purposesAllowed: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  applicationsAllowed: string[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  fallbackChannelKey: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'varchar', length: 120, default: 'system' })
  createdBy: string;

  @Column({ type: 'varchar', length: 120, default: 'system' })
  updatedBy: string;
}
