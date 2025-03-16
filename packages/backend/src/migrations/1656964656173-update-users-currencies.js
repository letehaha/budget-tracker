module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'UsersCurrencies',
        'exchangeRate',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'UsersCurrencies',
        'liveRateUpdate',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'UsersCurrencies',
        'isDefaultCurrency',
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
  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn('UsersCurrencies', 'exchangeRate', {
        transaction,
      });
      await queryInterface.removeColumn('UsersCurrencies', 'liveRateUpdate', {
        transaction,
      });
      await queryInterface.removeColumn('UsersCurrencies', 'isDefaultCurrency', { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
