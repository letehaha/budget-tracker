import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Migration to create TagReminders table.
 * Tag reminders allow users to set up notifications based on tag usage patterns.
 *
 * Scheduling behavior:
 * - No schedule (frequency = null) = real-time trigger on tagging (24h cooldown)
 * - With frequency = cron-based check at specified intervals
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'TagReminders',
        {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              model: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          tagId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              model: 'Tags',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          type: {
            type: DataTypes.STRING(20),
            allowNull: false,
            comment: 'amount_threshold | existence_check',
          },
          frequency: {
            type: DataTypes.STRING(15),
            allowNull: true,
            comment: 'daily | weekly | monthly | quarterly | yearly. Null = real-time mode',
          },
          dayOfMonth: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Day of month to check (1-31). Only for monthly/quarterly/yearly. Null = 1st',
          },
          settings: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: {},
            comment: 'Type-specific settings (e.g., { amountThreshold: 500 })',
          },
          isEnabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          lastCheckedAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          lastTriggeredAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      // Index for listing reminders by user
      await queryInterface.addIndex('TagReminders', ['userId'], {
        name: 'tag_reminders_user_id_idx',
        transaction: t,
      });

      // Index for listing reminders by tag
      await queryInterface.addIndex('TagReminders', ['tagId'], {
        name: 'tag_reminders_tag_id_idx',
        transaction: t,
      });

      // Index for scheduled reminders cron job queries
      await queryInterface.addIndex('TagReminders', ['isEnabled', 'frequency'], {
        name: 'tag_reminders_enabled_scheduled_idx',
        transaction: t,
      });

      // Index for real-time reminders (no schedule)
      await queryInterface.addIndex('TagReminders', ['isEnabled', 'tagId'], {
        name: 'tag_reminders_enabled_tag_idx',
        transaction: t,
        where: {
          frequency: null,
        },
      });

      // Index for getAllReminders query (user + isEnabled)
      await queryInterface.addIndex('TagReminders', ['userId', 'isEnabled'], {
        name: 'tag_reminders_user_enabled_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      const tableExists = await queryInterface.tableExists('TagReminders');
      if (tableExists) {
        await queryInterface.dropTable('TagReminders', { transaction: t });
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
