'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      await queryInterface.createTable(
        'AccountGroups',
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          userId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { table: 'Users', key: 'id' },
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          parentGroupId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { table: 'AccountGroups', key: 'id' },
          },
          createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
          updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
        },
        { transaction },
      );

      await queryInterface.createTable(
        'AccountGroupings',
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          accountId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { table: 'Accounts', key: 'id' },
          },
          groupId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { table: 'AccountGroups', key: 'id' },
          },
          createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
          updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
        },
        { transaction },
      );

      await queryInterface.addIndex('AccountGroupings', ['accountId', 'groupId'], {
        unique: true,
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      await queryInterface.dropTable('AccountGroupings', { transaction });
      await queryInterface.dropTable('AccountGroups', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
