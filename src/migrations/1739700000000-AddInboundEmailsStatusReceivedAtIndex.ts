import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * Composite index (status, receivedAt) for GET /email/inbound list query
 * used by speakasap-portal poll_new_emails task. Speeds up filtered + ordered query.
 */
export class AddInboundEmailsStatusReceivedAtIndex1739700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('inbound_emails');
    const exists = table?.indices.some(
      (i) => i.name === 'idx_inbound_emails_status_received_at',
    );
    if (!exists) {
      await queryRunner.createIndex(
        'inbound_emails',
        new TableIndex({
          name: 'idx_inbound_emails_status_received_at',
          columnNames: ['status', 'receivedAt'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('inbound_emails');
    const index = table?.indices.find(
      (i) => i.name === 'idx_inbound_emails_status_received_at',
    );
    if (index) {
      await queryRunner.dropIndex('inbound_emails', index);
    }
  }
}
