import type { AbstractQueryInterface, Transaction } from '@sequelize/core';
import { DataTypes } from '@sequelize/core';

/**
 * Vehicle tracking — manual asset accounts with depreciating value.
 *
 * 1. Migrate `Accounts.accountCategory` from a Postgres ENUM to VARCHAR(50). The
 *    project convention is VARCHAR + TS-side enums (see
 *    `.claude/memory/feedback_no_db_enums.md`); converting now lets us add the
 *    `'vehicle'` value and any future categories with a single shared-enums
 *    edit instead of a schema migration each time.
 * 2. Create the `Vehicles` table — 1:1 sidecar to the underlying `Accounts`
 *    row that holds the vehicle's depreciating balance, plus all metadata used
 *    by the depreciation pure function.
 */

const ACCOUNT_CATEGORY_VALUES = [
  'general',
  'cash',
  'current-account',
  'credit-card',
  'saving',
  'bonus',
  'insurance',
  'investment',
  'loan',
  'mortgage',
  'overdraft',
  'crypto',
];

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Drop the DEFAULT before changing the column type — Postgres cannot cast
      // an enum default to text automatically.
      await queryInterface.sequelize.query(`ALTER TABLE "Accounts" ALTER COLUMN "accountCategory" DROP DEFAULT;`, {
        transaction: t,
      });

      await queryInterface.sequelize.query(
        `ALTER TABLE "Accounts" ALTER COLUMN "accountCategory" TYPE VARCHAR(50) USING "accountCategory"::text;`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "Accounts" ALTER COLUMN "accountCategory" SET DEFAULT 'general';`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_Accounts_accountCategory";`, {
        transaction: t,
      });

      await queryInterface.createTable(
        'Vehicles',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          accountId: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
            references: { table: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { table: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          make: {
            type: DataTypes.STRING(100),
            allowNull: false,
          },
          model: {
            type: DataTypes.STRING(100),
            allowNull: false,
          },
          trim: {
            type: DataTypes.STRING(100),
            allowNull: true,
          },
          year: {
            type: DataTypes.SMALLINT,
            allowNull: false,
          },
          vehicleClass: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'sedan',
          },
          purchasePrice: {
            type: DataTypes.BIGINT,
            allowNull: false,
            comment: 'Purchase price in cents',
          },
          purchaseDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
          },
          valueAnchor: {
            type: DataTypes.BIGINT,
            allowNull: true,
            comment: 'Manual override value in cents; depreciation runs from here when set',
          },
          valueAnchorDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
          },
          depreciationPreset: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'class-default',
          },
          customAnnualRatePct: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
            comment: 'Flat annual depreciation %; used only when depreciationPreset = custom',
          },
          salvageFloorPct: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 10,
            comment: 'Floor as % of purchase price below which depreciation stops',
          },
          currentMileage: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Optional metadata in P1; no math impact',
          },
          valueLastComputedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: '7-day cache stamp for lazy-refresh; null forces recompute',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('Vehicles', ['userId'], { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.dropTable('Vehicles', { transaction: t });

      // Any rows with `accountCategory = 'vehicle'` would fail the cast into
      // the recreated ENUM. The corresponding Accounts rows were cascade-deleted
      // when Vehicles dropped, so in practice this UPDATE is a no-op safety net.
      await queryInterface.sequelize.query(
        `UPDATE "Accounts" SET "accountCategory" = 'general' WHERE "accountCategory" = 'vehicle';`,
        { transaction: t },
      );

      const enumValues = ACCOUNT_CATEGORY_VALUES.map((v) => `'${v}'`).join(', ');
      await queryInterface.sequelize.query(`CREATE TYPE "enum_Accounts_accountCategory" AS ENUM (${enumValues});`, {
        transaction: t,
      });

      await queryInterface.sequelize.query(`ALTER TABLE "Accounts" ALTER COLUMN "accountCategory" DROP DEFAULT;`, {
        transaction: t,
      });

      await queryInterface.sequelize.query(
        `ALTER TABLE "Accounts" ALTER COLUMN "accountCategory" TYPE "enum_Accounts_accountCategory" USING "accountCategory"::text::"enum_Accounts_accountCategory";`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "Accounts" ALTER COLUMN "accountCategory" SET DEFAULT 'general'::"enum_Accounts_accountCategory";`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
