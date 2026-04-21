module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('MonobankAccounts', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      accountId: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      balance: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      creditLimit: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      cashbackType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      maskedPan: {
        type: Sequelize.STRING(1000),
        allowNull: true,
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      iban: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      isEnabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('now'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('now'),
      },
      name: {
        type: Sequelize.STRING,
        defaultValue: null,
        allowNull: true,
      },
    });

    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.addColumn(
        'MonobankAccounts',
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
        'MonobankAccounts',
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
        'MonobankAccounts',
        'monoUserId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'MonobankUsers',
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
    await queryInterface.dropTable('MonobankAccounts');

    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();
    try {
      await queryInterface.removeColumn('MonobankAccounts', 'accountTypeId', {
        transaction,
      });
      await queryInterface.removeColumn('MonobankAccounts', 'currencyId', {
        transaction,
      });
      await queryInterface.removeColumn('MonobankAccounts', 'monoUserId', {
        transaction,
      });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
