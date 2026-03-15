/* eslint-disable @typescript-eslint/no-explicit-any */
import { AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Migration to remove LunchFlow integration
 * - Converts all accounts with type='lunchflow' to type='system'
 * - Removes lunchflow field from UserSettings
 * - Clears bankDataProviderConnectionId for lunchflow accounts
 * - Note: We keep the enum value temporarily to avoid breaking existing code
 *   The enum will be removed in a separate code change
 */
module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1. Convert all lunchflow accounts to system accounts
      // Also clear the bankDataProviderConnectionId as they're no longer connected
      await queryInterface.sequelize.query(
        `
        UPDATE "Accounts"
        SET
          type = 'system',
          "bankDataProviderConnectionId" = NULL
        WHERE type = 'lunchflow'
        `,
        { transaction: t },
      );

      // 2. Delete any BankDataProviderConnections that were for lunchflow
      // This is safe because we just nulled out all references above
      await queryInterface.sequelize.query(
        `DELETE FROM "BankDataProviderConnections" WHERE "providerType" = 'lunchflow'`,
        { transaction: t },
      );

      // 3. Remove lunchflow field from all UserSettings
      // Update JSONB column to remove the lunchflow key
      await queryInterface.sequelize.query(
        `
        UPDATE "UserSettings"
        SET settings = settings - 'lunchflow'
        WHERE settings ? 'lunchflow'
        `,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (): Promise<void> => {
    // This migration is not fully reversible as we lose the mapping of which accounts were lunchflow
    // If you need to rollback, restore from a backup
    throw new Error('This migration cannot be reversed - restore from backup if needed');
  },
};
