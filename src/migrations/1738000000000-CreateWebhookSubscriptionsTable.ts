import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateWebhookSubscriptionsTable1738000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('webhook_subscriptions')) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'webhook_subscriptions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'serviceName',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'webhook_url',
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
            name: 'max_retries',
            type: 'int',
            default: 3,
          },
          {
            name: 'delivery_timeout_ms',
            type: 'int',
            default: 120000,
          },
          {
            name: 'last_delivery_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_error_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'total_deliveries',
            type: 'int',
            default: 0,
          },
          {
            name: 'total_failures',
            type: 'int',
            default: 0,
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
