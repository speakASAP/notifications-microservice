import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateInboundEmailsTable1737763200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('inbound_emails');
    if (exists) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'inbound_emails',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'from_email',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'to_email',
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
            name: 'textBody',
            type: 'text',
          },
          {
            name: 'htmlBody',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'attachments',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'receivedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'processedAt',
            type: 'timestamp',
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
            name: 'rawData',
            type: 'jsonb',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'inbound_emails',
      new TableIndex({
        name: 'idx_inbound_emails_from',
        columnNames: ['from_email'],
      }),
    );

    await queryRunner.createIndex(
      'inbound_emails',
      new TableIndex({
        name: 'idx_inbound_emails_to',
        columnNames: ['to_email'],
      }),
    );

    await queryRunner.createIndex(
      'inbound_emails',
      new TableIndex({
        name: 'idx_inbound_emails_received_at',
        columnNames: ['receivedAt'],
      }),
    );

    await queryRunner.createIndex(
      'inbound_emails',
      new TableIndex({
        name: 'idx_inbound_emails_status',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('inbound_emails');
  }
}
