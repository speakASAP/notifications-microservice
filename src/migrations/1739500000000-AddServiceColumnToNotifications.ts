import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddServiceColumnToNotifications1739500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notifications');

    // Add service column if it doesn't exist
    const serviceColumn = table?.findColumnByName('service');
    if (!serviceColumn) {
      await queryRunner.addColumn(
        'notifications',
        new TableColumn({
          name: 'service',
          type: 'varchar',
          length: '100',
          isNullable: true,
          comment: "Service name that sent this notification (e.g. 'speakasap-portal', 'allegro-service')",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notifications');

    const serviceColumn = table?.findColumnByName('service');
    if (serviceColumn) {
      await queryRunner.dropColumn('notifications', 'service');
    }
  }
}
