import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateWebhookDeliveriesTable1738500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'webhook_deliveries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'inbound_email_id',
            type: 'uuid',
          },
          {
            name: 'subscription_id',
            type: 'uuid',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'sent'",
          },
          {
            name: 'http_status',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'delivered_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'ticket_id',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'comment_id',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'idx_webhook_deliveries_inbound_email_id',
        columnNames: ['inbound_email_id'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'idx_webhook_deliveries_subscription_id',
        columnNames: ['subscription_id'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'idx_webhook_deliveries_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createForeignKey(
      'webhook_deliveries',
      new TableForeignKey({
        columnNames: ['inbound_email_id'],
        referencedTableName: 'inbound_emails',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'webhook_deliveries',
      new TableForeignKey({
        columnNames: ['subscription_id'],
        referencedTableName: 'webhook_subscriptions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('webhook_deliveries');
    if (table) {
      const fks = table.foreignKeys;
      for (const fk of fks) {
        await queryRunner.dropForeignKey('webhook_deliveries', fk);
      }
    }
    await queryRunner.dropTable('webhook_deliveries');
  }
}
