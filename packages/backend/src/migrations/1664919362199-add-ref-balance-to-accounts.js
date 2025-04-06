module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Accounts',
        'refCurrentBalance',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Accounts',
        'refCreditLimit',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
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
      await queryInterface.removeColumn('Accounts', 'refCurrentBalance', {
        transaction,
      });
      await queryInterface.removeColumn('Accounts', 'refCreditLimit', {
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
