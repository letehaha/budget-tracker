module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.removeConstraint('UsersCurrencies', 'UsersCurrencies_userId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('UsersCurrencies', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'UsersCurrencies_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction,
      });

      await queryInterface.removeConstraint('UsersCurrencies', 'UsersCurrencies_currencyId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('UsersCurrencies', {
        fields: ['currencyId'],
        type: 'foreign key',
        name: 'UsersCurrencies_currencyId_fkey',
        references: {
          table: 'Currencies',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.removeConstraint('UsersCurrencies', 'UsersCurrencies_userId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('UsersCurrencies', {
        type: 'foreign key',
        fields: ['userId'],
        name: 'UsersCurrencies_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        transaction,
      });

      await queryInterface.removeConstraint('UsersCurrencies', 'UsersCurrencies_currencyId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('UsersCurrencies', {
        type: 'foreign key',
        fields: ['currencyId'],
        name: 'UsersCurrencies_currencyId_fkey',
        references: {
          table: 'Currencies',
          field: 'id',
        },
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
