import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Migration to create Notifications table for the unified notification system.
 * Supports multiple notification types (budget_alert, system, changelog, etc.)
 * with type-specific payloads stored in JSONB.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'Notifications',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
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
          type: {
            type: DataTypes.STRING(50),
            allowNull: false,
          },
          title: {
            type: DataTypes.STRING(200),
            allowNull: false,
          },
          message: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          payload: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: {},
          },
          status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'unread',
          },
          priority: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'normal',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
          readAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      // Primary query: unread notifications for a user
      await queryInterface.addIndex('Notifications', ['userId', 'status', 'createdAt'], {
        name: 'notifications_user_status_created_idx',
        transaction: t,
      });

      // Filter by type
      await queryInterface.addIndex('Notifications', ['userId', 'type', 'createdAt'], {
        name: 'notifications_user_type_created_idx',
        transaction: t,
      });

      // Cleanup job for expired notifications (simple index, filtering done in query)
      await queryInterface.addIndex('Notifications', ['expiresAt'], {
        name: 'notifications_expires_at_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable('Notifications');
  },
};
