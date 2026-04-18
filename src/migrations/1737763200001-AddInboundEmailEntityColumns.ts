import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Legacy inbound_emails (from_email / textBody / …) predates entity fields
 * attachments, processedAt, error, rawData. Add them when missing.
 */
export class AddInboundEmailEntityColumns1737763200001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('inbound_emails');
    if (!table) {
      return;
    }
    if (!table.findColumnByName('attachments')) {
      await queryRunner.query(
        `ALTER TABLE "inbound_emails" ADD COLUMN "attachments" jsonb`,
      );
    }
    if (!table.findColumnByName('processedAt')) {
      await queryRunner.query(
        `ALTER TABLE "inbound_emails" ADD COLUMN "processedAt" TIMESTAMP`,
      );
    }
    if (!table.findColumnByName('error')) {
      await queryRunner.query(`ALTER TABLE "inbound_emails" ADD COLUMN "error" text`);
    }
    if (!table.findColumnByName('rawData')) {
      await queryRunner.query(
        `ALTER TABLE "inbound_emails" ADD COLUMN "rawData" jsonb`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('inbound_emails');
    if (!table) {
      return;
    }
    if (table.findColumnByName('rawData')) {
      await queryRunner.query(`ALTER TABLE "inbound_emails" DROP COLUMN "rawData"`);
    }
    if (table.findColumnByName('error')) {
      await queryRunner.query(`ALTER TABLE "inbound_emails" DROP COLUMN "error"`);
    }
    if (table.findColumnByName('processedAt')) {
      await queryRunner.query(
        `ALTER TABLE "inbound_emails" DROP COLUMN "processedAt"`,
      );
    }
    if (table.findColumnByName('attachments')) {
      await queryRunner.query(
        `ALTER TABLE "inbound_emails" DROP COLUMN "attachments"`,
      );
    }
  }
}
