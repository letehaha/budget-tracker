import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Migration to add authUserId column to Users table for linking to better-auth.
 * Also makes password nullable since auth is now handled by better-auth.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Check if column already exists (idempotent migration)
      const tableDescription = await queryInterface.describeTable('Users');

      if (!tableDescription.authUserId) {
        // Add authUserId column to Users table
        await queryInterface.addColumn(
          'Users',
          'authUserId',
          {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          { transaction: t },
        );
      }

      // Create index on authUserId
      await queryInterface.addIndex('Users', ['authUserId'], {
        name: 'idx_users_auth_user_id',
        transaction: t,
      });

      // Make password nullable (auth is now handled by better-auth)
      await queryInterface.changeColumn(
        'Users',
        'password',
        {
          type: DataTypes.STRING,
          allowNull: true,
        },
        { transaction: t },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove index
      await queryInterface.removeIndex('Users', 'idx_users_auth_user_id', {
        transaction: t,
      });

      // Remove authUserId column
      await queryInterface.removeColumn('Users', 'authUserId', {
        transaction: t,
      });

      // Make password required again
      await queryInterface.changeColumn(
        'Users',
        'password',
        {
          type: DataTypes.STRING,
          allowNull: false,
        },
        { transaction: t },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
