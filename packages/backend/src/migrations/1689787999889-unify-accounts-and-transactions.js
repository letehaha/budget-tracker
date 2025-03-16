module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Accounts',
        'externalId',
        {
          type: Sequelize.STRING,
          allowNull: true,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Accounts',
        'externalData',
        {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Accounts',
        'isEnabled',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        { transaction },
      );
      await queryInterface.removeColumn('Accounts', 'internal', {
        transaction,
      });
      await queryInterface.addColumn(
        'Accounts',
        'type',
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: 'system',
        },
        { transaction },
      );

      await queryInterface.renameColumn('Transactions', 'authorId', 'userId', {
        transaction,
      });
      await queryInterface.addColumn(
        'Transactions',
        'originalId',
        {
          type: Sequelize.STRING,
          allowNull: true,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'externalData',
        {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'commissionRate',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'refCommissionRate',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'cashbackAmount',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );

      await queryInterface.dropTable('MonobankTransactions');
      await queryInterface.dropTable('MonobankAccounts');

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn('Accounts', 'type', { transaction });
      await queryInterface.addColumn(
        'Accounts',
        'internal',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
      );
      await queryInterface.removeColumn('Accounts', 'externalId', {
        transaction,
      });
      await queryInterface.removeColumn('Accounts', 'isEnabled', {
        transaction,
      });
      await queryInterface.removeColumn('Accounts', 'externalData', {
        transaction,
      });

      await queryInterface.renameColumn('Transactions', 'userId', 'authorId', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'originalId', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'externalData', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'commissionRate', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'refCommissionRate', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'cashbackAmount', {
        transaction,
      });

      await queryInterface.createTable(
        'MonobankTransactions',
        {
          id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            unique: true,
            allowNull: false,
            primaryKey: true,
          },
          originalId: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          description: {
            type: Sequelize.STRING(2000),
            allowNull: true,
          },
          amount: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          time: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('now'),
          },
          operationAmount: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          commissionRate: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          cashbackAmount: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          balance: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          hold: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
          },
          receiptId: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          note: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          userId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          categoryId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'Categories',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          transactionTypeId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'TransactionTypes',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          paymentTypeId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'PaymentTypes',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          monoAccountId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'MonobankAccounts',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          currencyId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'Currencies',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          transactionEntityId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'TransactionEntities',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          accountType: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'monobank',
          },
          paymentType: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'creditCard',
          },
          transactionType: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'income',
          },
        },
        { transaction },
      );

      await queryInterface.createTable(
        'MonobankAccounts',
        {
          id: {
            type: Sequelize.INTEGER,
            unique: true,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
          },
          accountId: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          balance: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          creditLimit: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          cashbackType: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          maskedPan: {
            type: Sequelize.STRING(1000),
            allowNull: true,
          },
          type: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          iban: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          isEnabled: {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
            allowNull: false,
          },
          createdAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.fn('now'),
          },
          updatedAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.fn('now'),
          },
          name: {
            type: Sequelize.STRING,
            defaultValue: false,
            allowNull: true,
          },
          accountTypeId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'AccountTypes',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          currencyId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'Currencies',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          monoUserId: {
            type: Sequelize.INTEGER,
            references: {
              model: 'MonobankUsers',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
        },
        { transaction },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
