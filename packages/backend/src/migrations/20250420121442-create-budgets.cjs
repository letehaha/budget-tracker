'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      await queryInterface.createTable(
        'Budgets',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          status: {
            type: Sequelize.ENUM('active', 'closed'),
            allowNull: false,
            defaultValue: 'active',
          },
          categoryName: {
            type: Sequelize.STRING(255),
            allowNull: true,
          },
          startDate: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          endDate: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          autoInclude: {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
          },
          limitAmount: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
          },
          userId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              table: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        },
        { transaction },
      );

      await queryInterface.createTable(
        'BudgetTransactions',
        {
          budgetId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              table: 'Budgets',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          transactionId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              table: 'Transactions',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        },
        { transaction },
      );

      await queryInterface.addConstraint('BudgetTransactions', {
        fields: ['budgetId', 'transactionId'],
        type: 'primary key',
        name: 'budgetTransactionsPkey',
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      const budgetTransactionsExists = await queryInterface.tableExists('BudgetTransactions');
      if (budgetTransactionsExists) {
        await queryInterface.removeConstraint('BudgetTransactions', 'budgetTransactionsPkey', { transaction });
        await queryInterface.dropTable('BudgetTransactions', { transaction });
      }

      const budgetsExists = await queryInterface.tableExists('Budgets');
      if (budgetsExists) {
        await queryInterface.dropTable('Budgets', { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
