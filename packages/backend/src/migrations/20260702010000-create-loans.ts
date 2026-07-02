import { DataTypes, QueryInterface } from 'sequelize';

/**
 * Loans schema foundation:
 * 1. Convert `transferNature` from the Postgres ENUM `enum_transfer_nature` to
 *    VARCHAR(50) — project convention is VARCHAR + TS-side enums, so new
 *    natures (`transfer_to_loan` and beyond) land via a shared-enums edit.
 * 2. `transfer_to_loan` becomes usable; legacy `common_transfer` payments to
 *    loan-category accounts keep working (reporting unions both).
 * 3. Create `LoanDetails` — 1:1 sidecar to a loan-category `Accounts` row (APR,
 *    term, payment plan, lender metadata, append-only `events` JSONB timeline).
 *    The Account still owns the balance and currency.
 */

const TRANSFER_NATURE_VALUES_BEFORE_LOAN = [
  'not_transfer',
  'transfer_between_user_accounts',
  'transfer_out_wallet',
  'transfer_to_portfolio',
  'transfer_to_venture',
];

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Convert every table bound to `enum_transfer_nature` (missing one would
      // fail the final DROP TYPE with a dependent-object error). Defaults must
      // drop before the cast — Postgres can't auto-cast an enum default to text.
      for (const tableName of ['Transactions', 'InvestmentTransactions']) {
        await queryInterface.sequelize.query(`ALTER TABLE "${tableName}" ALTER COLUMN "transferNature" DROP DEFAULT;`, {
          transaction,
        });

        await queryInterface.sequelize.query(
          `ALTER TABLE "${tableName}" ALTER COLUMN "transferNature" TYPE VARCHAR(50) USING "transferNature"::text;`,
          { transaction },
        );

        await queryInterface.sequelize.query(
          `ALTER TABLE "${tableName}" ALTER COLUMN "transferNature" SET DEFAULT 'not_transfer';`,
          { transaction },
        );
      }

      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_transfer_nature";`, {
        transaction,
      });

      // ACCOUNT_CATEGORIES drops `mortgage` in favor of `loan`; fold existing
      // rows so they keep passing the model's isIn validation. Not reversed in
      // `down` — `loan` predates this migration, so the split can't be reconstructed.
      await queryInterface.sequelize.query(
        `UPDATE "Accounts" SET "accountCategory" = 'loan' WHERE "accountCategory" = 'mortgage';`,
        { transaction },
      );

      // Unique accountId enforces the 1:1 with the underlying loan-category Account.
      await queryInterface.createTable(
        'LoanDetails',
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
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          loanType: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: 'Sub-type label; values in TS-side LOAN_TYPE enum',
          },
          originalPrincipal: {
            type: DataTypes.BIGINT,
            allowNull: false,
            comment: 'Lender-issued principal in cents; immutable after create',
          },
          refOriginalPrincipal: {
            type: DataTypes.BIGINT,
            allowNull: false,
            comment: 'originalPrincipal converted to user base currency at create time, in cents',
          },
          interestRate: {
            type: DataTypes.DECIMAL(7, 4),
            allowNull: false,
            comment: 'APR as percent; e.g. 3.7500 for 3.75%',
          },
          termMonths: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Original contractual term; reference data, payoff date is computed',
          },
          startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
          },
          balanceAnchorDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            comment:
              'Date the outstanding balance is asserted as-of; payments after it adjust the balance, earlier ones are baked into this snapshot',
          },
          minPayment: {
            type: DataTypes.BIGINT,
            allowNull: true,
            comment: 'Minimum required monthly payment in cents',
          },
          refMinPayment: {
            type: DataTypes.BIGINT,
            allowNull: true,
          },
          plannedPayment: {
            type: DataTypes.BIGINT,
            allowNull: true,
            comment: 'Drives projection; defaults to minPayment when absent',
          },
          refPlannedPayment: {
            type: DataTypes.BIGINT,
            allowNull: true,
          },
          paymentDayOfMonth: {
            type: DataTypes.SMALLINT,
            allowNull: true,
            comment: 'Day-of-month 1-31; consumers clamp 29/30/31 to last day of short months',
          },
          lenderName: {
            type: DataTypes.STRING(200),
            allowNull: true,
          },
          accountNumber: {
            type: DataTypes.STRING(100),
            allowNull: true,
            comment:
              "Lender's account/loan identifier as the user records it — last four digits, full number, or whatever they prefer. No format enforced",
          },
          events: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: [],
            comment: 'Append-only audit timeline; discriminated union of LoanEvent',
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
        { transaction },
      );

      await queryInterface.addIndex('LoanDetails', ['userId'], { transaction });
      await queryInterface.addIndex('LoanDetails', ['userId', 'loanType'], { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE "LoanDetails" ADD CONSTRAINT "LoanDetails_paymentDayOfMonth_check"
         CHECK ("paymentDayOfMonth" IS NULL OR ("paymentDayOfMonth" >= 1 AND "paymentDayOfMonth" <= 31));`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "LoanDetails" ADD CONSTRAINT "LoanDetails_interestRate_check"
         CHECK ("interestRate" >= 0 AND "interestRate" < 100);`,
        { transaction },
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Rewrite the rows still carrying `transfer_to_loan` before recreating the
      // enum without that member — both steps must commit together so a failed
      // rollback can't strand rows referencing a value the type no longer has.
      await queryInterface.sequelize.query(
        `UPDATE "Transactions" SET "transferNature" = 'not_transfer' WHERE "transferNature" = 'transfer_to_loan';`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE "InvestmentTransactions" SET "transferNature" = 'not_transfer' WHERE "transferNature" = 'transfer_to_loan';`,
        { transaction },
      );

      await queryInterface.dropTable('LoanDetails', { transaction });

      const enumValues = TRANSFER_NATURE_VALUES_BEFORE_LOAN.map((v) => `'${v}'`).join(', ');
      await queryInterface.sequelize.query(`CREATE TYPE "enum_transfer_nature" AS ENUM (${enumValues});`, {
        transaction,
      });

      // Restore both tables that originally bound to the enum. Order matches
      // the `up` direction to keep the migration symmetrical.
      for (const tableName of ['Transactions', 'InvestmentTransactions']) {
        await queryInterface.sequelize.query(`ALTER TABLE "${tableName}" ALTER COLUMN "transferNature" DROP DEFAULT;`, {
          transaction,
        });

        await queryInterface.sequelize.query(
          `ALTER TABLE "${tableName}" ALTER COLUMN "transferNature" TYPE "enum_transfer_nature" USING "transferNature"::text::"enum_transfer_nature";`,
          { transaction },
        );

        await queryInterface.sequelize.query(
          `ALTER TABLE "${tableName}" ALTER COLUMN "transferNature" SET DEFAULT 'not_transfer'::"enum_transfer_nature";`,
          { transaction },
        );
      }
    });
  },
};
