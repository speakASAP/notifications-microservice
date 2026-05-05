import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChannelRegistryTable1746445200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "channel_registry" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channelKey" character varying(120) NOT NULL,
        "type" character varying(20) NOT NULL,
        "provider" character varying(32) NOT NULL,
        "domain" character varying(255),
        "fromEmail" character varying(255),
        "fromName" character varying(255),
        "replyToEmail" character varying(255),
        "purposesAllowed" text[] NOT NULL DEFAULT '{}',
        "applicationsAllowed" text[] NOT NULL DEFAULT '{}',
        "isActive" boolean NOT NULL DEFAULT true,
        "fallbackChannelKey" character varying(120),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdBy" character varying(120) NOT NULL DEFAULT 'system',
        "updatedBy" character varying(120) NOT NULL DEFAULT 'system',
        CONSTRAINT "PK_channel_registry_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_channel_registry_channelKey" UNIQUE ("channelKey")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_channel_registry_key" ON "channel_registry" ("channelKey")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_channel_registry_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "channel_registry"`);
  }
}
