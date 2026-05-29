/* eslint-disable @typescript-eslint/no-explicit-any */
import { AbstractQueryInterface, DataTypes, Transaction } from '@sequelize/core';

const ENUM_SECURITY_PROVIDER = 'enum_security_provider';
const TABLE_NAME = 'SecurityCurrencyCaches';

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    // Part A: Add 'yahoo' to the security provider enum
    // PostgreSQL doesn't allow enum changes in transactions
    await queryInterface.sequelize.query(`ALTER TYPE "${ENUM_SECURITY_PROVIDER}" ADD VALUE IF NOT EXISTS 'yahoo';`);

    // Part B: Create SecurityCurrencyCache table
    await queryInterface.createTable(TABLE_NAME, {
      symbol: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
      currencyCode: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      providerName: {
        type: `"${ENUM_SECURITY_PROVIDER}"` as any,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Drop the cache table first
      await queryInterface.dropTable(TABLE_NAME, { transaction: t });

      // Delete all data associated with yahoo securities
      await queryInterface.sequelize.query(
        `DELETE FROM "InvestmentTransactions" WHERE "securityId" IN (
          SELECT id FROM "Securities" WHERE "providerName" = 'yahoo'
        );`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `DELETE FROM "Holdings" WHERE "securityId" IN (
          SELECT id FROM "Securities" WHERE "providerName" = 'yahoo'
        );`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `DELETE FROM "SecurityPricings" WHERE "securityId" IN (
          SELECT id FROM "Securities" WHERE "providerName" = 'yahoo'
        );`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(`DELETE FROM "Securities" WHERE "providerName" = 'yahoo';`, {
        transaction: t,
      });

      // Clean up orphaned 'yahoo' source values on SecurityPricings belonging to non-yahoo securities
      await queryInterface.sequelize.query(`UPDATE "SecurityPricings" SET "source" = NULL WHERE "source" = 'yahoo';`, {
        transaction: t,
      });

      // Recreate the enum without 'yahoo'
      await queryInterface.sequelize.query(
        `CREATE TYPE "${ENUM_SECURITY_PROVIDER}_new" AS ENUM ('polygon', 'other', 'alphavantage', 'fmp');`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "Securities" ALTER COLUMN "providerName" TYPE "${ENUM_SECURITY_PROVIDER}_new" USING "providerName"::text::"${ENUM_SECURITY_PROVIDER}_new";`,
        { transaction: t },
      );

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
