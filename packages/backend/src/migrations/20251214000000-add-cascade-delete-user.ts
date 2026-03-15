import { AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Migration to add ON DELETE CASCADE for userId foreign keys that are missing it.
 * This enables automatic cleanup of all user data when a user is deleted.
 *
 * Tables being updated:
 * - AccountGroups.userId
 * - BinanceUserSettings.userId
 * - UserMerchantCategoryCodes.userId
 */
module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1. AccountGroups.userId - add CASCADE
      await queryInterface.removeConstraint('AccountGroups', 'AccountGroups_userId_fkey', {
        transaction: t,
      });
      await queryInterface.addConstraint('AccountGroups', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'AccountGroups_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction: t,
      });

      // 2. BinanceUserSettings.userId - add CASCADE
      await queryInterface.removeConstraint('BinanceUserSettings', 'BinanceUserSettings_userId_fkey', {
        transaction: t,
      });
      await queryInterface.addConstraint('BinanceUserSettings', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'BinanceUserSettings_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction: t,
      });

      // 3. UserMerchantCategoryCodes.userId - add CASCADE
      await queryInterface.removeConstraint('UserMerchantCategoryCodes', 'UserMerchantCategoryCodes_userId_fkey', {
        transaction: t,
      });
      await queryInterface.addConstraint('UserMerchantCategoryCodes', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'UserMerchantCategoryCodes_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction: t,
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1. AccountGroups.userId - remove CASCADE (revert to NO ACTION)
      await queryInterface.removeConstraint('AccountGroups', 'AccountGroups_userId_fkey', {
        transaction: t,
      });
      await queryInterface.addConstraint('AccountGroups', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'AccountGroups_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'NO ACTION',
        onDelete: 'NO ACTION',
        transaction: t,
      });

      // 2. BinanceUserSettings.userId - remove CASCADE (revert to NO ACTION)
      await queryInterface.removeConstraint('BinanceUserSettings', 'BinanceUserSettings_userId_fkey', {
        transaction: t,
      });
      await queryInterface.addConstraint('BinanceUserSettings', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'BinanceUserSettings_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'NO ACTION',
        onDelete: 'NO ACTION',
        transaction: t,
      });

      // 3. UserMerchantCategoryCodes.userId - remove CASCADE (revert to NO ACTION)
      await queryInterface.removeConstraint('UserMerchantCategoryCodes', 'UserMerchantCategoryCodes_userId_fkey', {
        transaction: t,
      });
      await queryInterface.addConstraint('UserMerchantCategoryCodes', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'UserMerchantCategoryCodes_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'NO ACTION',
        onDelete: 'NO ACTION',
        transaction: t,
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
