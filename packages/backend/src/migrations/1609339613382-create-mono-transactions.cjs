module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
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
              table: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          categoryId: {
            type: Sequelize.INTEGER,
            references: {
              table: 'Categories',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          transactionTypeId: {
            type: Sequelize.INTEGER,
            references: {
              table: 'TransactionTypes',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          paymentTypeId: {
            type: Sequelize.INTEGER,
            references: {
              table: 'PaymentTypes',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          monoAccountId: {
            type: Sequelize.INTEGER,
            references: {
              table: 'MonobankAccounts',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          currencyId: {
            type: Sequelize.INTEGER,
            references: {
              table: 'Currencies',
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
  down: async (queryInterface) => {
    await queryInterface.dropTable('MonobankTransactions');

    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      await queryInterface.removeColumn('MonobankTransactions', 'userId', {
        transaction,
      });
      await queryInterface.removeColumn('MonobankTransactions', 'transactionTypeId', {
        transaction,
      });
      await queryInterface.removeColumn('MonobankTransactions', 'paymentTypeId', { transaction });
      await queryInterface.removeColumn('MonobankTransactions', 'monoAccountId', { transaction });
      await queryInterface.removeColumn('MonobankTransactions', 'categoryId', {
        transaction,
      });
      await queryInterface.removeColumn('MonobankTransactions', 'currencyId', {
        transaction,
      });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
