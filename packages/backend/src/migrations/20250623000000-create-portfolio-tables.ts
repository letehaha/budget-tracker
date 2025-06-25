/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryInterface, Transaction } from 'sequelize';

// Define constants for enum names to prevent typos
const ENUM_PORTFOLIO_TYPE = 'enum_portfolio_type';

module.exports = {
  up: async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Create ENUM types first
      await queryInterface.sequelize.query(
        `CREATE TYPE "${ENUM_PORTFOLIO_TYPE}" AS ENUM ('investment', 'retirement', 'savings', 'other');`,
        { transaction: t },
      );

      // Create Portfolios table
      await queryInterface.createTable(
        'Portfolios',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          userId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          portfolioType: {
            type: ENUM_PORTFOLIO_TYPE,
            allowNull: false,
            defaultValue: 'investment',
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          isEnabled: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction: t },
      );

      // Add unique constraint for user + name combination
      await queryInterface.addConstraint('Portfolios', {
        fields: ['userId', 'name'],
        type: 'unique',
        name: 'portfolios_user_name_unique',
        transaction: t,
      });

      // Add indexes for Portfolios
      await queryInterface.addIndex('Portfolios', ['userId'], {
        name: 'portfolios_user_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('Portfolios', ['portfolioType'], {
        name: 'portfolios_type_idx',
        transaction: t,
      });
      await queryInterface.addIndex('Portfolios', ['userId', 'portfolioType'], {
        name: 'portfolios_user_type_idx',
        transaction: t,
      });

      // Create PortfolioBalances table
      await queryInterface.createTable(
        'PortfolioBalances',
        {
          portfolioId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Portfolios',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          currencyId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Currencies',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          availableCash: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          totalCash: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          refAvailableCash: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          refTotalCash: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction: t },
      );

      // Add composite primary key for PortfolioBalances
      await queryInterface.addConstraint('PortfolioBalances', {
        fields: ['portfolioId', 'currencyId'],
        type: 'primary key',
        name: 'portfolio_balances_pkey',
        transaction: t,
      });

      // Add indexes for PortfolioBalances
      await queryInterface.addIndex('PortfolioBalances', ['portfolioId'], {
        name: 'portfolio_balances_portfolio_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('PortfolioBalances', ['currencyId'], {
        name: 'portfolio_balances_currency_id_idx',
        transaction: t,
      });

      // Create PortfolioTransfers table
      await queryInterface.createTable(
        'PortfolioTransfers',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          userId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          fromAccountId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: 'Accounts',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          toPortfolioId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: 'Portfolios',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          fromPortfolioId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: 'Portfolios',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          toAccountId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: 'Accounts',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          amount: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
          },
          refAmount: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
          },
          currencyId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Currencies',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          date: {
            type: Sequelize.DATEONLY,
            allowNull: false,
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction: t },
      );

      // Add check constraint for valid transfer direction
      await queryInterface.addConstraint('PortfolioTransfers', {
        fields: ['fromAccountId', 'toPortfolioId', 'fromPortfolioId', 'toAccountId'],
        type: 'check',
        name: 'portfolio_transfers_valid_direction_check',
        where: {
          [Sequelize.Op.or]: [
            // Account to Portfolio
            {
              [Sequelize.Op.and]: [
                { fromAccountId: { [Sequelize.Op.ne]: null } },
                { toPortfolioId: { [Sequelize.Op.ne]: null } },
                { fromPortfolioId: { [Sequelize.Op.eq]: null } },
                { toAccountId: { [Sequelize.Op.eq]: null } },
              ],
            },
            // Portfolio to Account
            {
              [Sequelize.Op.and]: [
                { fromPortfolioId: { [Sequelize.Op.ne]: null } },
                { toAccountId: { [Sequelize.Op.ne]: null } },
                { fromAccountId: { [Sequelize.Op.eq]: null } },
                { toPortfolioId: { [Sequelize.Op.eq]: null } },
              ],
            },
            // Portfolio to Portfolio
            {
              [Sequelize.Op.and]: [
                { fromPortfolioId: { [Sequelize.Op.ne]: null } },
                { toPortfolioId: { [Sequelize.Op.ne]: null } },
                { fromAccountId: { [Sequelize.Op.eq]: null } },
                { toAccountId: { [Sequelize.Op.eq]: null } },
              ],
            },
          ],
        },
        transaction: t,
      });

      // Add indexes for PortfolioTransfers
      await queryInterface.addIndex('PortfolioTransfers', ['userId'], {
        name: 'portfolio_transfers_user_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('PortfolioTransfers', ['fromAccountId'], {
        name: 'portfolio_transfers_from_account_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('PortfolioTransfers', ['toPortfolioId'], {
        name: 'portfolio_transfers_to_portfolio_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('PortfolioTransfers', ['fromPortfolioId'], {
        name: 'portfolio_transfers_from_portfolio_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('PortfolioTransfers', ['toAccountId'], {
        name: 'portfolio_transfers_to_account_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('PortfolioTransfers', ['date'], {
        name: 'portfolio_transfers_date_idx',
        transaction: t,
      });
      await queryInterface.addIndex('PortfolioTransfers', ['currencyId'], {
        name: 'portfolio_transfers_currency_id_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Drop tables in reverse order of creation (due to foreign key constraints)
      await queryInterface.dropTable('PortfolioTransfers', { transaction: t });
      await queryInterface.dropTable('PortfolioBalances', { transaction: t });
      await queryInterface.dropTable('Portfolios', { transaction: t });

      // Drop custom ENUM types
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${ENUM_PORTFOLIO_TYPE}";`, { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
