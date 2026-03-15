import { QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // Fix transactions that have negative amount, refAmount, or cashbackAmount.
    // All monetary values in Transactions should be stored as positive integers
    // (the sign is determined by transactionType: expense vs income).
    await queryInterface.sequelize.query(`
      UPDATE "Transactions"
      SET
        amount = ABS(amount),
        "refAmount" = ABS("refAmount"),
        "commissionRate" = ABS("commissionRate"),
        "refCommissionRate" = ABS("refCommissionRate"),
        "cashbackAmount" = ABS("cashbackAmount")
      WHERE amount < 0 OR "refAmount" < 0 OR "commissionRate" < 0 OR "refCommissionRate" < 0 OR "cashbackAmount" < 0
    `);
  },

  down: async (): Promise<void> => {
    // Cannot reliably revert since we don't know which records were originally negative
  },
};
