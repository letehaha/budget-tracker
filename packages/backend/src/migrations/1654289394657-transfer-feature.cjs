/**
 * Transfer feature migrations
 *
 * 1. Add new [fromAccountId, fromAccountType, toAccountId, toAccountType, oppositeId]
 *    columns to Transactions table which will describe Transfer functionality.
 * 2. Drop TransactionEntities table and replace foreign keys in other tables
 *    with new values from enums. Replace transactionEntityId foreign key in tables
 *    MonobankTransactions and Transactions with accountType column.
 * 3. Drop PaymentTypes table and replace foreign keys in other tables with new
 *    values from enums. Replace paymentTypeId with foreign key in tables
 *    MonobankTransactions and Transactions with paymentType column.
 * 4. Drop TransactionsTypes table and replace foreign keys in other tables with new
 *    values from enums. Replace transactionTypeId with foreign key in tables
 *    MonobankTransactions and Transactions with transactionType column.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1
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

      // 2
      await queryInterface.removeColumn('MonobankTransactions', 'transactionEntityId', {
        transaction,
      });
      await queryInterface.addColumn(
        'MonobankTransactions',
        'accountType',
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: 'monobank',
        },
        { transaction },
      );
      await queryInterface.removeColumn('Transactions', 'transactionEntityId', {
        transaction,
      });
      await queryInterface.addColumn(
        'Transactions',
        'accountType',
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: 'system',
        },
        { transaction },
      );
      await queryInterface.dropTable('TransactionEntities', { transaction });

      // 3
      await queryInterface.removeColumn('MonobankTransactions', 'paymentTypeId', { transaction });
      await queryInterface.addColumn(
        'MonobankTransactions',
        'paymentType',
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: 'creditCard',
        },
        { transaction },
      );
      await queryInterface.removeColumn('Transactions', 'paymentTypeId', {
        transaction,
      });
      await queryInterface.addColumn(
        'Transactions',
        'paymentType',
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: 'creditCard',
        },
        { transaction },
      );
      await queryInterface.dropTable('PaymentTypes', { transaction });

      // 4
      await queryInterface.addColumn(
        'MonobankTransactions',
        'transactionType',
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: 'income',
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        update "MonobankTransactions"
        set "transactionType" =
          CASE
            WHEN "transactionTypeId" = 1 THEN 'income'
            WHEN "transactionTypeId" = 2 THEN 'expense'
            WHEN "transactionTypeId" = 3 THEN 'transfer'
            ELSE 'income'
          END;
      `,
        { transaction },
      );

      await queryInterface.removeColumn('MonobankTransactions', 'transactionTypeId', {
        transaction,
      });

      await queryInterface.addColumn(
        'Transactions',
        'transactionType',
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: 'income',
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        update "Transactions"
        set "transactionType" =
          CASE
            WHEN "transactionTypeId" = 1 THEN 'income'
            WHEN "transactionTypeId" = 2 THEN 'expense'
            WHEN "transactionTypeId" = 3 THEN 'transfer'
            ELSE 'income'
          END;
      `,
        { transaction },
      );

      await queryInterface.removeColumn('Transactions', 'transactionTypeId', {
        transaction,
      });

      await queryInterface.dropTable('TransactionTypes', { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1
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

      // 2
      await queryInterface.createTable(
        'TransactionEntities',
        {
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
          type: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
        },
        { transaction },
      );

      await queryInterface.bulkInsert(
        'TransactionEntities',
        [
          { name: 'System', type: 1 },
          { name: 'Monobank', type: 2 },
        ],
        { transaction },
      );

      await queryInterface.removeColumn('MonobankTransactions', 'accountType', {
        transaction,
      });
      await queryInterface.addColumn(
        'MonobankTransactions',
        'transactionEntityId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'TransactionEntities',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.sequelize.query('UPDATE "MonobankTransactions" SET "transactionEntityId" = 2', {
        transaction,
      });

      await queryInterface.removeColumn('Transactions', 'accountType', {
        transaction,
      });
      await queryInterface.addColumn(
        'Transactions',
        'transactionEntityId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'TransactionEntities',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.sequelize.query('UPDATE "Transactions" SET "transactionEntityId" = 1', {
        transaction,
      });

      // 3
      await queryInterface.createTable(
        'PaymentTypes',
        {
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
        },
        { transaction },
      );

      await queryInterface.bulkInsert(
        'PaymentTypes',
        [
          { name: 'Bank transfer' },
          { name: 'Voucher' },
          { name: 'Web payment' },
          { name: 'Cash' },
          { name: 'Mobile payment' },
          { name: 'Credit card' },
          { name: 'Debit card' },
        ],
        { transaction },
      );

      await queryInterface.removeColumn('MonobankTransactions', 'paymentType', {
        transaction,
      });
      await queryInterface.addColumn(
        'MonobankTransactions',
        'paymentTypeId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'PaymentTypes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.sequelize.query('UPDATE "MonobankTransactions" SET "paymentTypeId" = 6', { transaction });

      await queryInterface.removeColumn('Transactions', 'paymentType', {
        transaction,
      });
      await queryInterface.addColumn(
        'Transactions',
        'paymentTypeId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'PaymentTypes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );
      await queryInterface.sequelize.query('UPDATE "Transactions" SET "paymentTypeId" = 6', {
        transaction,
      });

      // 4
      await queryInterface.createTable('TransactionTypes', {
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
        type: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
      });

      await queryInterface.bulkInsert(
        'TransactionTypes',
        [
          { name: 'Income', type: 1 },
          { name: 'Expense', type: 2 },
          { name: 'Transfer', type: 3 },
        ],
        {},
      );

      await queryInterface.addColumn(
        'MonobankTransactions',
        'transactionTypeId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'TransactionTypes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        update "MonobankTransactions"
        set "transactionTypeId" =
          CASE
            WHEN "transactionType" = 'income' THEN 1
            WHEN "transactionType" = 'expense' THEN 2
            WHEN "transactionType" = 'transfer' THEN 3
          END;
      `,
        { transaction },
      );
      await queryInterface.removeColumn('MonobankTransactions', 'transactionType', { transaction });

      await queryInterface.addColumn(
        'Transactions',
        'transactionTypeId',
        {
          type: Sequelize.INTEGER,
          references: {
            table: 'TransactionTypes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        update "Transactions"
        set "transactionTypeId" =
          CASE
            WHEN "transactionType" = 'income' THEN 1
            WHEN "transactionType" = 'expense' THEN 2
            WHEN "transactionType" = 'transfer' THEN 3
          END;
      `,
        { transaction },
      );
      await queryInterface.removeColumn('Transactions', 'transactionType', {
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
