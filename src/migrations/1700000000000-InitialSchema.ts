import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notifications table
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'channel',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'type',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'recipient',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'subject',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'message',
            type: 'text',
          },
          {
            name: 'templateData',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'messageId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'direction',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'service',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        indices: [
          new TableIndex({ name: 'idx_notifications_channel', columnNames: ['channel'] }),
          new TableIndex({ name: 'idx_notifications_type', columnNames: ['type'] }),
          new TableIndex({ name: 'idx_notifications_recipient', columnNames: ['recipient'] }),
          new TableIndex({ name: 'idx_notifications_status', columnNames: ['status'] }),
          new TableIndex({ name: 'idx_notifications_created_at', columnNames: ['createdAt'] }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notifications', true);
  }
}
