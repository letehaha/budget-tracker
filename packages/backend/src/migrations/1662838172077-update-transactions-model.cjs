module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.addColumn(
        'Transactions',
        'refAmount',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );

      // rename column from userId to authorId
      await queryInterface.removeConstraint('Transactions', 'Transactions_userId_fkey', {
        transaction,
      });
      await queryInterface.renameColumn('Transactions', 'userId', 'authorId', {
        transaction,
      });
      await queryInterface.addConstraint('Transactions', {
        fields: ['authorId'],
        type: 'foreign key',
        name: 'Transactions_authorId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction,
      });

      await queryInterface.addColumn(
        'Transactions',
        'currencyCode',
        {
          type: Sequelize.STRING,
          allowNull: false,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'Transactions',
        'refCurrencyCode',
        {
          type: Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'Transactions',
        'isTransfer',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'Transactions',
        'transferId',
        {
          type: Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        update "Transactions"
        set "refAmount" = "amount"
      `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        update "Transactions"
        set "isTransfer" = true
        where "transactionType" = 'transfer'
      `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        update "Transactions"
        set "currencyCode" = (
          select "code"
          from "Currencies"
          where "Transactions"."currencyId"="Currencies"."id"
        )
      `,
        { transaction },
      );

      await queryInterface.removeColumn('Transactions', 'fromAccountId', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'fromAccountType', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'toAccountId', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'toAccountType', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'oppositeId', {
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.removeColumn('Transactions', 'refAmount', {
        transaction,
      });

      // rename column from userId to authorId
      await queryInterface.removeConstraint('Transactions', 'Transactions_authorId_fkey', {
        transaction,
      });
      await queryInterface.renameColumn('Transactions', 'authorId', 'userId', {
        transaction,
      });
      await queryInterface.addConstraint('Transactions', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'Transactions_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction,
      });

      await queryInterface.removeColumn('Transactions', 'currencyCode', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'refCurrencyCode', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'isTransfer', {
        transaction,
      });
      await queryInterface.removeColumn('Transactions', 'transferId', {
        transaction,
      });

      await queryInterface.addColumn(
        'Transactions',
        'fromAccountId',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'fromAccountType',
        {
          type: Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'toAccountId',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'toAccountType',
        {
          type: Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'Transactions',
        'oppositeId',
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
