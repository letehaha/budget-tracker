/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, QueryInterface, Transaction } from 'sequelize';

// Define constants for enum names to prevent typos
const ENUM_SECURITY_PROVIDER = 'enum_security_provider';
const ENUM_ASSET_CLASS = 'enum_asset_class';
const ENUM_INVESTMENT_TRANSACTION_CATEGORY = 'enum_investment_transaction_category';

// reuse existing enum
const ENUM_TRANSACTION_TYPE = 'enum_transactions_transaction_type'; // exactly fully lowercase to avoid any case-sensitivity issues
const ENUM_TRANSFER_NATURE = 'enum_transfer_nature';

module.exports = {
  up: async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Create ENUM types first
      await queryInterface.sequelize.query(`CREATE TYPE "${ENUM_SECURITY_PROVIDER}" AS ENUM ('polygon', 'other');`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `CREATE TYPE "${ENUM_ASSET_CLASS}" AS ENUM ('cash', 'crypto', 'fixed_income', 'options', 'stocks', 'other');`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `CREATE TYPE "${ENUM_INVESTMENT_TRANSACTION_CATEGORY}" AS ENUM ('buy', 'sell', 'dividend', 'transfer', 'tax', 'fee', 'cancel', 'other');`,
        { transaction: t },
      );

      // Create Securities table
      await queryInterface.createTable(
        'Securities',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          symbol: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          cusip: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          isin: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          sharesPerContract: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          currencyCode: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          cryptoCurrencyCode: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          pricingLastSyncedAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          isBrokerageCash: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          exchangeAcronym: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          exchangeMic: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          exchangeName: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          providerName: {
            type: ENUM_SECURITY_PROVIDER,
            allowNull: false,
          },
          assetClass: {
            type: ENUM_ASSET_CLASS,
            allowNull: false,
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

      await queryInterface.addIndex('Securities', ['symbol'], {
        name: 'securities_symbol_idx',
        transaction: t,
      });
      await queryInterface.addIndex('Securities', ['cusip'], {
        name: 'securities_cusip_idx',
        transaction: t,
      });
      await queryInterface.addIndex('Securities', ['isin'], {
        name: 'securities_isin_idx',
        transaction: t,
      });
      await queryInterface.addIndex('Securities', ['providerName'], {
        name: 'securities_provider_name_idx',
        transaction: t,
      });
      await queryInterface.addIndex('Securities', ['assetClass'], {
        name: 'securities_asset_class_idx',
        transaction: t,
      });

      // Create Holdings table
      await queryInterface.createTable(
        'Holdings',
        {
          accountId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Accounts',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          securityId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Securities',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          value: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
          },
          refValue: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
          },
          quantity: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          costBasis: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          refCostBasis: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          currencyCode: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'USD',
          },
          excluded: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
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

      await queryInterface.addConstraint('Holdings', {
        fields: ['accountId', 'securityId'],
        type: 'primary key',
        name: 'holdings_pkey',
        transaction: t,
      });
      await queryInterface.addIndex('Holdings', ['accountId'], {
        name: 'holdings_account_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('Holdings', ['securityId'], {
        name: 'holdings_security_id_idx',
        transaction: t,
      });

      // Create InvestmentTransactions table
      await queryInterface.createTable(
        'InvestmentTransactions',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          accountId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Accounts',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          securityId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Securities',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          transactionType: {
            type: ENUM_TRANSACTION_TYPE,
            allowNull: false,
          },
          date: {
            type: Sequelize.DATEONLY,
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING(2000),
            allowNull: true,
          },
          amount: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
          },
          refAmount: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
          },
          fees: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          refFees: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          quantity: {
            type: Sequelize.DECIMAL(36, 18),
            allowNull: false,
          },
          price: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
          },
          refPrice: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
          },
          currencyCode: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'USD',
          },
          category: {
            type: ENUM_INVESTMENT_TRANSACTION_CATEGORY,
            allowNull: false,
          },
          transferNature: {
            type: ENUM_TRANSFER_NATURE,
            allowNull: false,
            defaultValue: 'not_transfer',
          },
          transferId: {
            type: Sequelize.STRING,
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

      await queryInterface.addIndex('InvestmentTransactions', ['accountId'], {
        name: 'investment_transactions_account_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('InvestmentTransactions', ['securityId'], {
        name: 'investment_transactions_security_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('InvestmentTransactions', ['date'], {
        name: 'investment_transactions_date_idx',
        transaction: t,
      });
      await queryInterface.addIndex('InvestmentTransactions', ['category'], {
        name: 'investment_transactions_category_idx',
        transaction: t,
      });
      await queryInterface.addIndex('InvestmentTransactions', ['transferId'], {
        name: 'investment_transactions_transfer_id_idx',
        transaction: t,
      });

      // Create SecurityPricings table
      await queryInterface.createTable(
        'SecurityPricings',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          securityId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Securities',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          date: {
            type: Sequelize.DATEONLY,
            allowNull: false,
          },
          priceClose: {
            type: Sequelize.DECIMAL(20, 10),
            allowNull: false,
          },
          priceAsOf: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          source: {
            type: Sequelize.STRING,
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

      await queryInterface.addIndex('SecurityPricings', ['securityId', 'date'], {
        unique: true,
        name: 'security_pricing_unique_security_date_idx',
        transaction: t,
      });
      await queryInterface.addIndex('SecurityPricings', ['securityId'], {
        name: 'security_pricing_security_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('SecurityPricings', ['date'], {
        name: 'security_pricing_date_idx',
        transaction: t,
      });

      await queryInterface.addConstraint('Securities', {
        fields: ['symbol', 'cusip', 'isin'],
        type: 'check',
        name: 'securities_identifier_check',
        where: {
          [Op.or]: [{ symbol: { [Op.ne]: null } }, { cusip: { [Op.ne]: null } }, { isin: { [Op.ne]: null } }],
        },
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
      await queryInterface.dropTable('SecurityPricings', { transaction: t });
      await queryInterface.dropTable('InvestmentTransactions', {
        transaction: t,
      });
      await queryInterface.dropTable('Holdings', { transaction: t });
      await queryInterface.dropTable('Securities', { transaction: t });

      // Drop custom ENUM types
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${ENUM_INVESTMENT_TRANSACTION_CATEGORY}";`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${ENUM_ASSET_CLASS}";`, { transaction: t });
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${ENUM_SECURITY_PROVIDER}";`, { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
