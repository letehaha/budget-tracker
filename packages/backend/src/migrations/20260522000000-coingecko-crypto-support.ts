/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AbstractQueryInterface, Transaction } from '@sequelize/core';

const ENUM_SECURITY_PROVIDER = 'enum_security_provider';
const ENUM_ASSET_CLASS = 'enum_asset_class';

const UNIQUE_PROVIDER_SYMBOL_INDEX = 'securities_provider_name_provider_symbol_unique_idx';

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Convert Securities.providerName from ENUM to VARCHAR
      await queryInterface.sequelize.query(
        `ALTER TABLE "Securities" ALTER COLUMN "providerName" TYPE VARCHAR USING "providerName"::text;`,
        { transaction: t },
      );

      // 2. Convert Securities.assetClass from ENUM to VARCHAR
      await queryInterface.sequelize.query(
        `ALTER TABLE "Securities" ALTER COLUMN "assetClass" TYPE VARCHAR USING "assetClass"::text;`,
        { transaction: t },
      );

      // 3. Convert SecurityCurrencyCaches.providerName from ENUM to VARCHAR
      await queryInterface.sequelize.query(
        `ALTER TABLE "SecurityCurrencyCaches" ALTER COLUMN "providerName" TYPE VARCHAR USING "providerName"::text;`,
        { transaction: t },
      );

      // 4. Drop now-orphaned enum types
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${ENUM_SECURITY_PROVIDER}";`, { transaction: t });
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${ENUM_ASSET_CLASS}";`, { transaction: t });

      // 5. Add providerSymbol column to Securities, backfilled from symbol
      await queryInterface.sequelize.query(`ALTER TABLE "Securities" ADD COLUMN "providerSymbol" VARCHAR NULL;`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `UPDATE "Securities" SET "providerSymbol" = "symbol" WHERE "symbol" IS NOT NULL;`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `UPDATE "Securities" SET "providerSymbol" = COALESCE("cusip", "isin") WHERE "providerSymbol" IS NULL;`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`ALTER TABLE "Securities" ALTER COLUMN "providerSymbol" SET NOT NULL;`, {
        transaction: t,
      });

      // 6. Unique index on (providerName, providerSymbol) so the same provider can't store the
      //    same coin/ticker twice, while different providers may use the same symbol string.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "${UNIQUE_PROVIDER_SYMBOL_INDEX}" ON "Securities" ("providerName", "providerSymbol");`,
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
      // 1. Drop unique index and providerSymbol column
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${UNIQUE_PROVIDER_SYMBOL_INDEX}";`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(`ALTER TABLE "Securities" DROP COLUMN IF EXISTS "providerSymbol";`, {
        transaction: t,
      });

      // 2. Remove rows with coingecko provider before recreating the (narrower) enum
      await queryInterface.sequelize.query(
        `DELETE FROM "InvestmentTransactions" WHERE "securityId" IN (
          SELECT id FROM "Securities" WHERE "providerName" = 'coingecko'
        );`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `DELETE FROM "Holdings" WHERE "securityId" IN (
          SELECT id FROM "Securities" WHERE "providerName" = 'coingecko'
        );`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `DELETE FROM "SecurityPricings" WHERE "securityId" IN (
          SELECT id FROM "Securities" WHERE "providerName" = 'coingecko'
        );`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`DELETE FROM "Securities" WHERE "providerName" = 'coingecko';`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(`DELETE FROM "SecurityCurrencyCaches" WHERE "providerName" = 'coingecko';`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `UPDATE "SecurityPricings" SET "source" = NULL WHERE "source" = 'coingecko';`,
        { transaction: t },
      );

      // 3. Recreate enum_security_provider with the pre-coingecko value set
      await queryInterface.sequelize.query(
        `CREATE TYPE "${ENUM_SECURITY_PROVIDER}" AS ENUM ('polygon', 'other', 'alphavantage', 'fmp', 'yahoo');`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Securities" ALTER COLUMN "providerName" TYPE "${ENUM_SECURITY_PROVIDER}" USING "providerName"::"${ENUM_SECURITY_PROVIDER}";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "SecurityCurrencyCaches" ALTER COLUMN "providerName" TYPE "${ENUM_SECURITY_PROVIDER}" USING "providerName"::"${ENUM_SECURITY_PROVIDER}";`,
        { transaction: t },
      );

      // 4. Recreate enum_asset_class with the original value set
      await queryInterface.sequelize.query(
        `CREATE TYPE "${ENUM_ASSET_CLASS}" AS ENUM ('cash', 'crypto', 'fixed_income', 'options', 'stocks', 'other');`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Securities" ALTER COLUMN "assetClass" TYPE "${ENUM_ASSET_CLASS}" USING "assetClass"::"${ENUM_ASSET_CLASS}";`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
