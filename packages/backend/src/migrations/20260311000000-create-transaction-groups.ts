import { DataTypes, AbstractQueryInterface, Transaction } from '@sequelize/core';

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.createTable(
        'TransactionGroups',
        {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              table: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          name: {
            type: DataTypes.STRING(100),
            allowNull: false,
          },
          note: {
            type: DataTypes.STRING(500),
            allowNull: true,
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
        { transaction: t },
      );

      await queryInterface.addIndex('TransactionGroups', ['userId'], {
        name: 'transaction_groups_user_id_idx',
        transaction: t,
      });

      await queryInterface.createTable(
        'TransactionGroupItems',
        {
          groupId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              table: 'TransactionGroups',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          transactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              table: 'Transactions',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        },
        { transaction: t },
      );

      await queryInterface.addConstraint('TransactionGroupItems', {
        fields: ['groupId', 'transactionId'],
        type: 'PRIMARY KEY',
        name: 'transaction_group_items_pkey',
        transaction: t,
      });

      await queryInterface.addIndex('TransactionGroupItems', ['transactionId'], {
        name: 'transaction_group_items_transaction_id_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      const itemsExists = await queryInterface.tableExists('TransactionGroupItems');
      if (itemsExists) {
        await queryInterface.removeConstraint('TransactionGroupItems', 'transaction_group_items_pkey', {
          transaction: t,
        });
        await queryInterface.dropTable('TransactionGroupItems', { transaction: t });
      }

      const groupsExists = await queryInterface.tableExists('TransactionGroups');
      if (groupsExists) {
        await queryInterface.dropTable('TransactionGroups', { transaction: t });
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
