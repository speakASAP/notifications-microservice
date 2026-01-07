import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProviderColumnToNotifications1736256000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notifications');
    
    // Add provider column if it doesn't exist
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

    // Add direction column if it doesn't exist
    const directionColumn = table?.findColumnByName('direction');
    if (!directionColumn) {
      await queryRunner.addColumn(
        'notifications',
        new TableColumn({
          name: 'direction',
          type: 'varchar',
          length: '20',
          isNullable: true,
          comment: "Email direction: 'inbound' | 'outbound'",
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

    const directionColumn = table?.findColumnByName('direction');
    if (directionColumn) {
      await queryRunner.dropColumn('notifications', 'direction');
    }
  }
}
