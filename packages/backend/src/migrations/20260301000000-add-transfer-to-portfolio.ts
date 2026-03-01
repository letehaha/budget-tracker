import { QueryInterface, DataTypes, Op } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // PostgreSQL doesn't allow ALTER TYPE ADD VALUE inside a transaction
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_transfer_nature" ADD VALUE IF NOT EXISTS 'transfer_to_portfolio';`,
    );

    await queryInterface.addColumn('PortfolioTransfers', 'transactionId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      references: {
        model: 'Transactions',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    // Update check constraint to allow direct deposits/withdrawals
    // (only toPortfolioId or fromPortfolioId set, all other FKs null)
    await queryInterface.removeConstraint('PortfolioTransfers', 'portfolio_transfers_valid_direction_check');

    await queryInterface.addConstraint('PortfolioTransfers', {
      fields: ['fromAccountId', 'toPortfolioId', 'fromPortfolioId', 'toAccountId'],
      type: 'check',
      name: 'portfolio_transfers_valid_direction_check',
      where: {
        [Op.or]: [
          // Account to Portfolio
          {
            [Op.and]: [
              { fromAccountId: { [Op.ne]: null } },
              { toPortfolioId: { [Op.ne]: null } },
              { fromPortfolioId: { [Op.eq]: null } },
              { toAccountId: { [Op.eq]: null } },
            ],
          },
          // Portfolio to Account
          {
            [Op.and]: [
              { fromPortfolioId: { [Op.ne]: null } },
              { toAccountId: { [Op.ne]: null } },
              { fromAccountId: { [Op.eq]: null } },
              { toPortfolioId: { [Op.eq]: null } },
            ],
          },
          // Portfolio to Portfolio
          {
            [Op.and]: [
              { fromPortfolioId: { [Op.ne]: null } },
              { toPortfolioId: { [Op.ne]: null } },
              { fromAccountId: { [Op.eq]: null } },
              { toAccountId: { [Op.eq]: null } },
            ],
          },
          // Direct Deposit (only toPortfolioId set)
          {
            [Op.and]: [
              { toPortfolioId: { [Op.ne]: null } },
              { fromAccountId: { [Op.eq]: null } },
              { fromPortfolioId: { [Op.eq]: null } },
              { toAccountId: { [Op.eq]: null } },
            ],
          },
          // Direct Withdrawal (only fromPortfolioId set)
          {
            [Op.and]: [
              { fromPortfolioId: { [Op.ne]: null } },
              { fromAccountId: { [Op.eq]: null } },
              { toPortfolioId: { [Op.eq]: null } },
              { toAccountId: { [Op.eq]: null } },
            ],
          },
        ],
      },
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    // Restore original check constraint (without deposit/withdrawal)
    await queryInterface.removeConstraint('PortfolioTransfers', 'portfolio_transfers_valid_direction_check');

    await queryInterface.addConstraint('PortfolioTransfers', {
      fields: ['fromAccountId', 'toPortfolioId', 'fromPortfolioId', 'toAccountId'],
      type: 'check',
      name: 'portfolio_transfers_valid_direction_check',
      where: {
        [Op.or]: [
          {
            [Op.and]: [
              { fromAccountId: { [Op.ne]: null } },
              { toPortfolioId: { [Op.ne]: null } },
              { fromPortfolioId: { [Op.eq]: null } },
              { toAccountId: { [Op.eq]: null } },
            ],
          },
          {
            [Op.and]: [
              { fromPortfolioId: { [Op.ne]: null } },
              { toAccountId: { [Op.ne]: null } },
              { fromAccountId: { [Op.eq]: null } },
              { toPortfolioId: { [Op.eq]: null } },
            ],
          },
          {
            [Op.and]: [
              { fromPortfolioId: { [Op.ne]: null } },
              { toPortfolioId: { [Op.ne]: null } },
              { fromAccountId: { [Op.eq]: null } },
              { toAccountId: { [Op.eq]: null } },
            ],
          },
        ],
      },
    });

    await queryInterface.removeColumn('PortfolioTransfers', 'transactionId');

    // Reset any transactions using the new enum value before removing it
    await queryInterface.sequelize.query(
      `UPDATE "Transactions" SET "transferNature" = 'not_transfer' WHERE "transferNature" = 'transfer_to_portfolio';`,
    );

    // Recreate enum without 'transfer_to_portfolio'
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `CREATE TYPE "enum_transfer_nature_new" AS ENUM ('not_transfer', 'transfer_between_user_accounts', 'transfer_out_wallet');`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`ALTER TABLE "Transactions" ALTER COLUMN "transferNature" DROP DEFAULT;`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" ALTER COLUMN "transferNature" TYPE "enum_transfer_nature_new" USING "transferNature"::text::"enum_transfer_nature_new";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`DROP TYPE "enum_transfer_nature";`, { transaction: t });
      await queryInterface.sequelize.query(`ALTER TYPE "enum_transfer_nature_new" RENAME TO "enum_transfer_nature";`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" ALTER COLUMN "transferNature" SET DEFAULT 'not_transfer'::"enum_transfer_nature";`,
        { transaction: t },
      );
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
