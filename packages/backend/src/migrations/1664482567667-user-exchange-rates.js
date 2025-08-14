const TABLE_NAME = 'UserExchangeRates';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        TABLE_NAME,
        {
          id: {
            type: Sequelize.INTEGER,
            unique: true,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
          },
          baseCode: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          quoteCode: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          rate: {
            type: Sequelize.FLOAT,
            allowNull: true,
            defaultValue: 1,
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

      await queryInterface.addColumn(
        TABLE_NAME,
        'baseId',
        {
          type: Sequelize.INTEGER,
          references: {
            model: 'Currencies',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction },
      );

      await queryInterface.addColumn(
        TABLE_NAME,
        'quoteId',
        {
          type: Sequelize.INTEGER,
          references: {
            model: 'Currencies',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction },
      );

      await queryInterface.addColumn(
        TABLE_NAME,
        'userId',
        {
          type: Sequelize.INTEGER,
          references: {
            model: 'Users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction },
      );

      // Change old INTEGER format to FLOAT
      await queryInterface.changeColumn(
        'UsersCurrencies',
        'exchangeRate',
        {
          type: Sequelize.FLOAT,
          allowNull: true,
          defaultValue: 1,
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
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.dropTable(TABLE_NAME, { transaction });

      await queryInterface.changeColumn(
        'UsersCurrencies',
        'exchangeRate',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
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
