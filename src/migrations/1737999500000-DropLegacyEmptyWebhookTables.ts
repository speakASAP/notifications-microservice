import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Empty legacy webhook tables (url/eventType/…) block TypeORM migrations that
 * expect the current schema. Drop them only when both are empty.
 */
export class DropLegacyEmptyWebhookTables1737999500000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasDeliveries = await queryRunner.hasTable('webhook_deliveries');
    const hasSubs = await queryRunner.hasTable('webhook_subscriptions');
    if (!hasDeliveries && !hasSubs) {
      return;
    }
    const [{ c: delCount }] = hasDeliveries
      ? await queryRunner.query(`select count(*)::int as c from "webhook_deliveries"`)
      : [{ c: 0 }];
    const [{ c: subCount }] = hasSubs
      ? await queryRunner.query(`select count(*)::int as c from "webhook_subscriptions"`)
      : [{ c: 0 }];
    if (delCount !== 0 || subCount !== 0) {
      return;
    }
    if (hasDeliveries) {
      await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries" CASCADE`);
    }
    if (hasSubs) {
      await queryRunner.query(`DROP TABLE IF EXISTS "webhook_subscriptions" CASCADE`);
    }
  }

  public async down(): Promise<void> {
    // Irreversible: we only removed empty legacy scaffolding.
  }
}
