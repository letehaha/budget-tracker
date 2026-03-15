import { AbstractQueryInterface, Transaction } from '@sequelize/core';

// exactly fully lowercase to avoid any case-sensitivity issues
const ENUM_TRANSACTION_TYPE = 'enum_transactions_transaction_type';

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      // 1. Create the new ENUM type
      await queryInterface.sequelize.query(
        `
        CREATE TYPE "${ENUM_TRANSACTION_TYPE}" AS ENUM ('income', 'expense', 'transfer');
      `,
        { transaction: t },
      );

      // 2. Drop the old string-based default value
      await queryInterface.sequelize.query(
        `
        ALTER TABLE "Transactions" ALTER COLUMN "transactionType" DROP DEFAULT;
      `,
        { transaction: t },
      );

      // 3. Change the column type, using the new ENUM and casting the existing string values.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE "Transactions"
        ALTER COLUMN "transactionType" TYPE "${ENUM_TRANSACTION_TYPE}"
        USING "transactionType"::"${ENUM_TRANSACTION_TYPE}";
      `,
        { transaction: t },
      );

      // 4. Add the new default value, correctly cast to the ENUM type
      await queryInterface.sequelize.query(
        `
        ALTER TABLE "Transactions"
        ALTER COLUMN "transactionType" SET DEFAULT 'income'::"${ENUM_TRANSACTION_TYPE}";
      `,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      // 1. Drop the ENUM-based default value
      await queryInterface.sequelize.query(
        `
        ALTER TABLE "Transactions" ALTER COLUMN "transactionType" DROP DEFAULT;
      `,
        { transaction: t },
      );

      // 2. Change the column type back to STRING, casting the ENUM values to text.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE "Transactions"
        ALTER COLUMN "transactionType" TYPE VARCHAR(255)
        USING "transactionType"::text;
      `,
        { transaction: t },
      );

      // 3. Add the old string-based default value back
      await queryInterface.sequelize.query(
        `
        ALTER TABLE "Transactions"
        ALTER COLUMN "transactionType" SET DEFAULT 'income';
      `,
        { transaction: t },
      );

      // 4. Drop the ENUM type
      await queryInterface.sequelize.query(`DROP TYPE "${ENUM_TRANSACTION_TYPE}";`, { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
