module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Transactions', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      amount: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      note: {
        type: Sequelize.STRING(2000),
        allowNull: true,
      },
      time: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });

    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.addColumn(
        'Transactions',
        'userId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'Users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'categoryId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'Categories',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'transactionTypeId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'TransactionTypes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'paymentTypeId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'PaymentTypes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'accountId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'Accounts',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'currencyId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'Currencies',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
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
    await queryInterface.dropTable('Transactions');

    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      await queryInterface.removeColumn('Transactions', 'userId', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'transactionTypeId', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'paymentTypeId', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'accountId', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'categoryId', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'currencyId', {
        transaction,
      });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
