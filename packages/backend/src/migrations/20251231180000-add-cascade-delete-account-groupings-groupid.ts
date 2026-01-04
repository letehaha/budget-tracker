/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryInterface, Transaction } from 'sequelize';

/**
 * Migration to add CASCADE delete behavior to AccountGroupings.groupId foreign key.
 * When a group is deleted (e.g., when user is deleted), all its mappings in AccountGroupings
 * will be automatically removed.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove the existing foreign key constraint
      await queryInterface.removeConstraint('AccountGroupings', 'AccountGroupings_groupId_fkey', {
        transaction: t,
      });

      // Add the foreign key constraint with CASCADE delete
      await queryInterface.addConstraint('AccountGroupings', {
        fields: ['groupId'],
        type: 'foreign key',
        name: 'AccountGroupings_groupId_fkey',
        references: {
          table: 'AccountGroups',
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

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove the CASCADE foreign key constraint
      await queryInterface.removeConstraint('AccountGroupings', 'AccountGroupings_groupId_fkey', {
        transaction: t,
      });

      // Add back the original foreign key constraint without CASCADE
      await queryInterface.addConstraint('AccountGroupings', {
        fields: ['groupId'],
        type: 'foreign key',
        name: 'AccountGroupings_groupId_fkey',
        references: {
          table: 'AccountGroups',
          field: 'id',
        },
        onUpdate: 'CASCADE',
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
