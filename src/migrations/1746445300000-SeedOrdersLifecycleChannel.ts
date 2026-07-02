import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedOrdersLifecycleChannel1746445300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "channel_registry" (
        "channelKey",
        "type",
        "provider",
        "fromEmail",
        "fromName",
        "purposesAllowed",
        "applicationsAllowed",
        "isActive",
        "createdBy",
        "updatedBy"
      ) VALUES (
        'orders.lifecycle',
        'email',
        'ses',
        NULL,
        NULL,
        ARRAY['transactional']::text[],
        ARRAY['orders-microservice']::text[],
        true,
        'migration:orders-lifecycle-channel',
        'migration:orders-lifecycle-channel'
      )
      ON CONFLICT ("channelKey") DO UPDATE SET
        "type" = EXCLUDED."type",
        "provider" = EXCLUDED."provider",
        "purposesAllowed" = EXCLUDED."purposesAllowed",
        "applicationsAllowed" = EXCLUDED."applicationsAllowed",
        "isActive" = true,
        "updatedAt" = now(),
        "updatedBy" = EXCLUDED."updatedBy"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "channel_registry"
      WHERE "channelKey" = 'orders.lifecycle'
        AND "createdBy" = 'migration:orders-lifecycle-channel'
    `);
  }
}
