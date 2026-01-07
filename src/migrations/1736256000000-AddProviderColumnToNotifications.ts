import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProviderColumnToNotifications1736256000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists
    const table = await queryRunner.getTable('notifications');
    const providerColumn = table?.findColumnByName('provider');

    if (!providerColumn) {
      await queryRunner.addColumn(
        'notifications',
        new TableColumn({
          name: 'provider',
          type: 'varchar',
          length: '20',
          isNullable: true,
          comment: "Email provider used: 'sendgrid', 'ses', etc.",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notifications');
    const providerColumn = table?.findColumnByName('provider');

    if (providerColumn) {
      await queryRunner.dropColumn('notifications', 'provider');
    }
  }
}
