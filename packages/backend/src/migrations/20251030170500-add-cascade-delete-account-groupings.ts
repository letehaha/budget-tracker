/* eslint-disable @typescript-eslint/no-explicit-any */
import { AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Migration to add CASCADE delete behavior to AccountGroupings table.
 * When an account is deleted, all its mappings in AccountGroupings will be automatically removed.
 * The groups themselves remain intact - only the relationship rows are deleted.
 */
module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Remove the existing foreign key constraint
      await queryInterface.removeConstraint('AccountGroupings', 'AccountGroupings_accountId_fkey', {
        transaction: t,
      });

      // Add the foreign key constraint with CASCADE delete
      await queryInterface.addConstraint('AccountGroupings', {
        fields: ['accountId'],
        type: 'foreign key',
        name: 'AccountGroupings_accountId_fkey',
        references: {
          table: 'Accounts',
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
      // Remove the CASCADE foreign key constraint
      await queryInterface.removeConstraint('AccountGroupings', 'AccountGroupings_accountId_fkey', {
        transaction: t,
      });

      // Add back the original foreign key constraint without CASCADE
      await queryInterface.addConstraint('AccountGroupings', {
        fields: ['accountId'],
        type: 'foreign key',
        name: 'AccountGroupings_accountId_fkey',
        references: {
          table: 'Accounts',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        transaction: t,
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
