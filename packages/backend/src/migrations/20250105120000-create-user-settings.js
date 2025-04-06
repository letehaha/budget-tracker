'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'UserSettings',
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
            onDelete: 'CASCADE',
          },
          settings: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {},
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('NOW()'),
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('NOW()'),
          },
        },
        { transaction },
      );

      await queryInterface.addIndex('UserSettings', ['userId'], {
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.dropTable('UserSettings', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
