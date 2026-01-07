import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateWebhookSubscriptionsTable1738000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'webhook_subscriptions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'serviceName',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'webhookUrl',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'secret',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'filters',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'active'",
          },
          {
            name: 'retryCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'maxRetries',
            type: 'int',
            default: 3,
          },
          {
            name: 'lastDeliveryAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastErrorAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastError',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'totalDeliveries',
            type: 'int',
            default: 0,
          },
          {
            name: 'totalFailures',
            type: 'int',
            default: 0,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'webhook_subscriptions',
      new TableIndex({
        name: 'idx_webhook_subscriptions_service_name',
        columnNames: ['serviceName'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_subscriptions',
      new TableIndex({
        name: 'idx_webhook_subscriptions_status',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('webhook_subscriptions');
  }
}
