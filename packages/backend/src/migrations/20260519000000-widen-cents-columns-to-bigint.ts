import type { AbstractQueryInterface } from '@sequelize/core';

// Cents columns were originally INTEGER (32-bit signed, max ~2.14B). That
// overflows for accounts denominated in low-unit currencies (IDR, VND, etc.)
// or for very large balances. Widening every cents column to BIGINT (64-bit)
// removes the ceiling without changing semantics — existing values fit cleanly.
//
// NOTE: ALTER COLUMN TYPE INTEGER → BIGINT rewrites the entire table under an
// ACCESS EXCLUSIVE lock. For large tables (Transactions, Balances) this can
// take minutes; reads and writes are blocked the whole time. Plan accordingly.
const CENTS_COLUMNS: [string, string][] = [
  ['Accounts', 'initialBalance'],
  ['Accounts', 'refInitialBalance'],
  ['Accounts', 'currentBalance'],
  ['Accounts', 'refCurrentBalance'],
  ['Accounts', 'creditLimit'],
  ['Accounts', 'refCreditLimit'],
  ['Balances', 'amount'],
  ['Budgets', 'limitAmount'],
  ['PaymentReminders', 'expectedAmount'],
  ['SubscriptionCandidates', 'averageAmount'],
  ['Subscriptions', 'expectedAmount'],
  ['TransactionSplits', 'amount'],
  ['TransactionSplits', 'refAmount'],
  ['Transactions', 'amount'],
  ['Transactions', 'refAmount'],
  ['Transactions', 'commissionRate'],
  ['Transactions', 'refCommissionRate'],
  ['Transactions', 'cashbackAmount'],
];

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [table, column] of CENTS_COLUMNS) {
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE BIGINT`, {
          transaction,
        });
      }
    });
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [table, column] of CENTS_COLUMNS) {
        // Narrowing back to INTEGER will fail if any row exceeds 2.14B — that
        // is the intended behaviour: a forced narrow would lose data.
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE INTEGER`, {
          transaction,
        });
      }
    });
  },
};
