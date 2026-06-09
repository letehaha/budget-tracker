import { DataTypes, QueryInterface } from 'sequelize';

/**
 * Loans Phase 1 schema foundation.
 *
 * 1. Migrate `Transactions.transferNature` from the Postgres ENUM
 *    `enum_transfer_nature` to VARCHAR(50). Project convention is VARCHAR +
 *    TS-side enums (see `.claude/memory/feedback_no_db_enums.md`); converting
 *    now lets future transfer-nature values (`transfer_to_loan` here, anything
 *    later) land via a shared-enums edit instead of an `ALTER TYPE ADD VALUE`
 *    per addition.
 * 2. Add `transfer_to_loan` as a usable value on the freshly-typed VARCHAR
 *    column. Loan payments recorded via the new flow tag with this nature;
 *    legacy `common_transfer` payments to loan-category accounts continue to
 *    work (reporting queries union both).
 * 3. Create the `LoanDetails` table – 1:1 sidecar to a loan-category
 *    `Accounts` row that holds APR, term, payment plan, lender metadata, and
 *    the append-only `events` JSONB log used as a lightweight audit timeline.
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
      // Step 1: convert transferNature ENUM -> VARCHAR(50).
      // Drop the default before changing the type – Postgres cannot cast an
      // enum default to text automatically.
      await queryInterface.sequelize.query(`ALTER TABLE "Transactions" ALTER COLUMN "transferNature" DROP DEFAULT;`, {
        transaction,
      });

      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" ALTER COLUMN "transferNature" TYPE VARCHAR(50) USING "transferNature"::text;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" ALTER COLUMN "transferNature" SET DEFAULT 'not_transfer';`,
        { transaction },
      );

      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_transfer_nature";`, {
        transaction,
      });

      // Step 2: create the LoanDetails table. Sidecar to Accounts; unique
      // accountId enforces the 1:1 with the underlying loan-category Account.
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
          replacedByLoanId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: 'Breadcrumb to the loan that replaced this one via refinance',
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
    // Reset any rows still on the value the recreated ENUM won't accept.
    // Run outside the transaction so the recreated ENUM block can rely on
    // a clean column state regardless of session quirks.
    await queryInterface.sequelize.query(
      `UPDATE "Transactions" SET "transferNature" = 'not_transfer' WHERE "transferNature" = 'transfer_to_loan';`,
    );

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('LoanDetails', { transaction });

      const enumValues = TRANSFER_NATURE_VALUES_BEFORE_LOAN.map((v) => `'${v}'`).join(', ');
      await queryInterface.sequelize.query(`CREATE TYPE "enum_transfer_nature" AS ENUM (${enumValues});`, {
        transaction,
      });

      await queryInterface.sequelize.query(`ALTER TABLE "Transactions" ALTER COLUMN "transferNature" DROP DEFAULT;`, {
        transaction,
      });

      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" ALTER COLUMN "transferNature" TYPE "enum_transfer_nature" USING "transferNature"::text::"enum_transfer_nature";`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" ALTER COLUMN "transferNature" SET DEFAULT 'not_transfer'::"enum_transfer_nature";`,
        { transaction },
      );
    });
  },
};
