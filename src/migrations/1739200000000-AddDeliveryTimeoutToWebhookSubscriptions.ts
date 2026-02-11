import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Add per-subscription delivery timeout (ms). On timeout we double it instead of suspending.
 */
export class AddDeliveryTimeoutToWebhookSubscriptions1739200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'webhook_subscriptions',
      new TableColumn({
        name: 'delivery_timeout_ms',
        type: 'int',
        default: 120000,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('webhook_subscriptions', 'delivery_timeout_ms');
  }
}
