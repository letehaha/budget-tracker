module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Accounts', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      currentBalance: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      creditLimit: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    });

    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.addColumn(
        'Accounts',
        'accountTypeId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'AccountTypes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Accounts',
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
      await queryInterface.addColumn(
        'Accounts',
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
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Accounts');

    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      await queryInterface.removeColumn('Accounts', 'accountTypeId', {
        transaction,
      });
      await queryInterface.removeColumn('Accounts', 'currencyId', {
        transaction,
      });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
