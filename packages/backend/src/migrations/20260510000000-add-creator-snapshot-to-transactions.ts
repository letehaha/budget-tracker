import { DataTypes } from '@sequelize/core';
import type { AbstractQueryInterface, Transaction } from '@sequelize/core';

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Holds a frozen `{ userId, username, avatar }` snapshot of a transaction's original
      // creator. Stays NULL on every existing row and on every new transaction created
      // through normal flows — populated only when a user is being deleted, immediately
      // before the FK SET NULL nulls `userId`. The snapshot lets the frontend render
      // "alice (deleted)" on shared-account transactions whose creator is gone, instead
      // of an anonymous "Unknown user" entry.
      await queryInterface.addColumn(
        'Transactions',
        'creatorSnapshot',
        {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: null,
        },
        { transaction: t },
      );

      // Flip `Transactions.userId` FK from `ON DELETE CASCADE` to `ON DELETE SET NULL` so
      // transactions a deleted user created on OTHERS' shared accounts survive the user
      // destroy with their `userId` nulled (and the `creatorSnapshot` above carrying the
      // original identity). Transactions on the deleted user's OWN accounts continue to
      // cascade away via `Accounts.userId` (still CASCADE) → `Transactions.accountId`
      // (still CASCADE), so nothing leaks for the non-shared path.
      //
      // History: the FK has lived under two constraint names because of a
      // `userId` → `authorId` → `userId` column-rename round-trip
      // (migrations `1662838172077-update-transactions-model.js` +
      // `1689787999889-unify-accounts-and-transactions.js`) — column-rename does NOT
      // rename the constraint. Drop both possible names defensively before re-adding
      // under the original name so the schema lands in a known state regardless of
      // which name survived the rename history in any given environment.
      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" DROP CONSTRAINT IF EXISTS "Transactions_userId_fkey";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" DROP CONSTRAINT IF EXISTS "Transactions_authorId_fkey";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions"
           ADD CONSTRAINT "Transactions_userId_fkey"
           FOREIGN KEY ("userId") REFERENCES "Users"("id")
           ON UPDATE CASCADE ON DELETE SET NULL;`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Restore the prior CASCADE behaviour first so the column drop stays a clean
      // revert if a future operator rolls back from this migration alone.
      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" DROP CONSTRAINT IF EXISTS "Transactions_userId_fkey";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions"
           ADD CONSTRAINT "Transactions_userId_fkey"
           FOREIGN KEY ("userId") REFERENCES "Users"("id")
           ON UPDATE CASCADE ON DELETE CASCADE;`,
        { transaction: t },
      );

      await queryInterface.removeColumn('Transactions', 'creatorSnapshot', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
