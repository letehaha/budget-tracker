/* eslint-disable @typescript-eslint/no-explicit-any */
import { AbstractQueryInterface, Transaction } from '@sequelize/core';

// Define constants for enum names to prevent typos
const ENUM_SECURITY_PROVIDER = 'enum_security_provider';

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    // Add enum values without transaction as PostgreSQL doesn't allow enum changes in transactions
    await queryInterface.sequelize.query(
      `ALTER TYPE "${ENUM_SECURITY_PROVIDER}" ADD VALUE IF NOT EXISTS 'alphavantage';`,
    );

    await queryInterface.sequelize.query(`ALTER TYPE "${ENUM_SECURITY_PROVIDER}" ADD VALUE IF NOT EXISTS 'fmp';`);
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // PostgreSQL doesn't support dropping enum values directly
      // We need to recreate the enum without 'alphavantage' and 'fmp'
      // But first, we'll delete all data associated with these securities

      // 1. Delete InvestmentTransactions that reference 'alphavantage' or 'fmp' securities
      await queryInterface.sequelize.query(
        `DELETE FROM "InvestmentTransactions" WHERE "securityId" IN (
          SELECT id FROM "Securities" WHERE "providerName" IN ('alphavantage', 'fmp')
        );`,
        { transaction: t },
      );

      // 2. Delete Holdings that reference 'alphavantage' or 'fmp' securities
      await queryInterface.sequelize.query(
        `DELETE FROM "Holdings" WHERE "securityId" IN (
          SELECT id FROM "Securities" WHERE "providerName" IN ('alphavantage', 'fmp')
        );`,
        { transaction: t },
      );

      // 3. Delete SecurityPricing that reference 'alphavantage' or 'fmp' securities
      await queryInterface.sequelize.query(
        `DELETE FROM "SecurityPricings" WHERE "securityId" IN (
          SELECT id FROM "Securities" WHERE "providerName" IN ('alphavantage', 'fmp')
        );`,
        { transaction: t },
      );

      // 4. Delete Securities with 'alphavantage' or 'fmp' provider
      await queryInterface.sequelize.query(
        `DELETE FROM "Securities" WHERE "providerName" IN ('alphavantage', 'fmp');`,
        {
          transaction: t,
        },
      );

      // 5. Create a new enum without 'alphavantage' and 'fmp'
      await queryInterface.sequelize.query(
        `CREATE TYPE "${ENUM_SECURITY_PROVIDER}_new" AS ENUM ('polygon', 'other');`,
        { transaction: t },
      );

      // 6. Update the securities table to use the new enum
      await queryInterface.sequelize.query(
        `ALTER TABLE "Securities" ALTER COLUMN "providerName" TYPE "${ENUM_SECURITY_PROVIDER}_new" USING "providerName"::text::"${ENUM_SECURITY_PROVIDER}_new";`,
        { transaction: t },
      );

      // 7. Drop the old enum and rename the new one
      await queryInterface.sequelize.query(`DROP TYPE "${ENUM_SECURITY_PROVIDER}";`, { transaction: t });

      await queryInterface.sequelize.query(
        `ALTER TYPE "${ENUM_SECURITY_PROVIDER}_new" RENAME TO "${ENUM_SECURITY_PROVIDER}";`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
