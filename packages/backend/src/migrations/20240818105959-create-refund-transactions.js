'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.createTable(
        'RefundTransactions',
        {
          id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
          },
          userId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              table: 'Users',
              key: 'id',
            },
            onDelete: 'CASCADE',
          },
          originalTxId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              table: 'Transactions',
              key: 'id',
            },
            onDelete: 'SET NULL',
          },
          refundTxId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            unique: true,
            references: {
              table: 'Transactions',
              key: 'id',
            },
            onDelete: 'CASCADE',
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
        },
        { transaction },
      );

      await queryInterface.addIndex('RefundTransactions', ['userId'], {
        transaction,
      });
      await queryInterface.addIndex('RefundTransactions', ['originalTxId'], {
        transaction,
      });
      await queryInterface.addIndex('RefundTransactions', ['refundTxId'], {
        unique: true,
        transaction,
      });

      await queryInterface.addColumn(
        'Transactions',
        'refundLinked',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.removeIndex('RefundTransactions', ['userId'], {
        transaction,
      });
      await queryInterface.removeIndex('RefundTransactions', ['originalTxId'], {
        transaction,
      });
      await queryInterface.removeIndex('RefundTransactions', ['refundTxId'], {
        transaction,
      });
      await queryInterface.dropTable('RefundTransactions', { transaction });

      await queryInterface.removeColumn('Transactions', 'refundLinked', {
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
