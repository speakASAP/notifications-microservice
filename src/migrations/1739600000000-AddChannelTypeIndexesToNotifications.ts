import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * Add indexes on notifications.channel and notifications.type for faster
 * admin stats aggregation (GROUP BY channel, GROUP BY status, GROUP BY type).
 */
export class AddChannelTypeIndexesToNotifications1739600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notifications');
    const hasChannelIndex = table?.indices.some((i) => i.name === 'idx_notifications_channel');
    const hasTypeIndex = table?.indices.some((i) => i.name === 'idx_notifications_type');

    if (!hasChannelIndex) {
      await queryRunner.createIndex(
        'notifications',
        new TableIndex({
          name: 'idx_notifications_channel',
          columnNames: ['channel'],
        }),
      );
    }
    if (!hasTypeIndex) {
      await queryRunner.createIndex(
        'notifications',
        new TableIndex({
          name: 'idx_notifications_type',
          columnNames: ['type'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notifications');
    const channelIndex = table?.indices.find((i) => i.name === 'idx_notifications_channel');
    const typeIndex = table?.indices.find((i) => i.name === 'idx_notifications_type');

    if (channelIndex) {
      await queryRunner.dropIndex('notifications', channelIndex);
    }
    if (typeIndex) {
      await queryRunner.dropIndex('notifications', typeIndex);
    }
  }
}
