'use strict';

/**
 * Creates Balances table, and populates it with a history of balances based on existing transactions and accounts.
 *
 * - Retrieves all transactions and accounts from the database.
 * - Iterates through each transaction and calculates the balance incrementally for each account.
 * - Inserts a new entry into the Balances table for each transaction, including the date, account ID, and calculated balance.
 * - Handles accounts without transactions and inserts entries with a balance of 0 in the Balances table.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Accounts',
        'initialBalance',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );

      // Create Balances table
      await queryInterface.createTable(
        'Balances',
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          date: {
            allowNull: false,
            type: Sequelize.DATEONLY,
          },
          amount: {
            allowNull: false,
            type: Sequelize.INTEGER,
          },
          accountId: {
            allowNull: false,
            type: Sequelize.INTEGER,
            references: {
              model: 'Accounts',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          createdAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.fn('now'),
          },
          updatedAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.fn('now'),
          },
        },
        { transaction },
      );

      // TODO: Improve migration
      // // Retrieve all transactions ordered by date in ascending order
      // const transactions = await queryInterface.sequelize.query(
      //   'SELECT * FROM "Transactions" ORDER BY "time" ASC',
      //   { type: Sequelize.QueryTypes.SELECT },
      // );

      // // Map to track the current balance for each account on a specific date
      // const accountBalances = new Map();
      // // Map to track what accounts are linked to transactions, to later find
      // // unlinked accounts
      // const accountIdsUsedForTransactions = new Set();

      // // Loop through each transaction
      // for (const transaction of transactions) {
      //   const { accountId, amount } = transaction;

      //   // If accountId is not linked, ignore and go to next item
      //   if (!accountId) continue

      //   accountIdsUsedForTransactions.add(accountId);
      //   const transactionDate = transaction.time.toISOString().split('T')[0];

      //   // Get the current balance for the account on the specific date or default to 0 if not found
      //   const currentBalance = accountBalances.get(`${accountId}-${transactionDate}`) || 0;

      //   // Calculate the new balance by accumulating the transaction amount for the specific date
      //   const newBalance = currentBalance + amount;

      //   // Update the current balance for the account on the specific date in the map
      //   accountBalances.set(`${accountId}-${transactionDate}`, newBalance);
      // }

      // // Retrieve all distinct account IDs from Transactions table
      // const accountsData = await queryInterface.sequelize.query(
      //   'SELECT "id", "currentBalance" FROM "Accounts" GROUP BY "id"',
      //   { type: Sequelize.QueryTypes.SELECT }
      // );

      // // Loop through all existing accounts
      // for (const { id: accountId, currentBalance } of accountsData) {
      //   // Check if the account does not have any associated transactions
      //   if (accountId && !accountIdsUsedForTransactions.has(accountId)) {
      //     // Insert a new entry into Balances with account's current balance
      //     await queryInterface.bulkInsert('Balances', [
      //       {
      //         date: new Date(),
      //         accountId: accountId,
      //         amount: currentBalance,
      //       },
      //     ], { transaction });
      //   }
      // }

      // // Insert a new entry into Balances table for each account and date with the accumulated balance
      // const balanceEntries = Array.from(accountBalances).map(([key, value]) => {
      //   const [accountId, ...date] = key.split('-');
      //   return {
      //     date: new Date(date.join('-')),
      //     accountId: parseInt(accountId),
      //     amount: value,
      //   };
      // });

      // if (balanceEntries.length) {
      //   await queryInterface.bulkInsert('Balances', balanceEntries, { transaction });
      // }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Accounts', 'initialBalance');
    await queryInterface.dropTable('Balances');
  },
};
