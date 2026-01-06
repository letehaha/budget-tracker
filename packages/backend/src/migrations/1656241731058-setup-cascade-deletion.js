// 1. On system account deletion, delete all associated transactions
// 2. On system user deletion, delete all associated system transactions
// 3. On monobank user deletion, delete all associated mono accounts
// 4. On system user deletion, delete all associated mono users
// 5. On monobank account deletion, delete all associated mono transactions
// 6. On system user deletion, delete all associated categories
// 7. On system user deletion, delete all associated accounts

// 8. On system user deletion, delete all associated user currencies
// 9. On system user deletion, delete all associated user MCC codes

module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1. On system account deletion, delete all associated transactions
      await queryInterface.removeConstraint('Transactions', 'Transactions_accountId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('Transactions', {
        fields: ['accountId'],
        type: 'foreign key',
        name: 'Transactions_accountId_fkey',
        references: {
          table: 'Accounts',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction,
      });

      // 2. On system user deletion, delete all associated system transactions
      await queryInterface.removeConstraint('Transactions', 'Transactions_userId_fkey', {
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

      // 3. On monobank user deletion, delete all associated mono accounts
      await queryInterface.removeConstraint('MonobankAccounts', 'MonobankAccounts_monoUserId_fkey', { transaction });
      await queryInterface.addConstraint('MonobankAccounts', {
        fields: ['monoUserId'],
        type: 'foreign key',
        name: 'MonobankAccounts_monoUserId_fkey',
        references: {
          table: 'MonobankUsers',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction,
      });

      // 4. On system user deletion, delete all associated mono users
      await queryInterface.removeConstraint('MonobankUsers', 'MonobankUsers_systemUserId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('MonobankUsers', {
        fields: ['systemUserId'],
        type: 'foreign key',
        name: 'MonobankUsers_systemUserId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction,
      });

      // 5. On monobank account deletion, delete all associated mono transactions
      await queryInterface.removeConstraint('MonobankTransactions', 'MonobankTransactions_monoAccountId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('MonobankTransactions', {
        fields: ['monoAccountId'],
        type: 'foreign key',
        name: 'MonobankTransactions_monoAccountId_fkey',
        references: {
          table: 'MonobankAccounts',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction,
      });

      // 6. On system user deletion, delete all associated categories
      await queryInterface.removeConstraint('Categories', 'Categories_userId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('Categories', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'Categories_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction,
      });

      // 7. On system user deletion, delete all associated accounts
      await queryInterface.removeConstraint('Accounts', 'Accounts_userId_fkey', { transaction });
      await queryInterface.addConstraint('Accounts', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'Accounts_userId_fkey',
        references: {
          table: 'Users',
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
      // 1. On system account deletion, delete all associated transactions
      await queryInterface.removeConstraint('Transactions', 'Transactions_accountId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('Transactions', {
        type: 'foreign key',
        fields: ['accountId'],
        name: 'Transactions_accountId_fkey',
        references: {
          table: 'Accounts',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        transaction,
      });

      // 2. On system user deletion, delete all associated system transactions
      await queryInterface.removeConstraint('Transactions', 'Transactions_userId_fkey', {
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
        onDelete: 'SET NULL',
        transaction,
      });

      // 3. On monobank user deletion, delete all associated mono accounts
      await queryInterface.removeConstraint('MonobankAccounts', 'MonobankAccounts_monoUserId_fkey', { transaction });
      await queryInterface.addConstraint('MonobankAccounts', {
        fields: ['monoUserId'],
        type: 'foreign key',
        name: 'MonobankAccounts_monoUserId_fkey',
        references: {
          table: 'MonobankUsers',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        transaction,
      });

      // 4. On system user deletion, delete all associated mono users
      await queryInterface.removeConstraint('MonobankUsers', 'MonobankUsers_systemUserId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('MonobankUsers', {
        fields: ['systemUserId'],
        type: 'foreign key',
        name: 'MonobankUsers_systemUserId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        transaction,
      });

      // 5. On monobank account deletion, delete all associated mono transactions
      await queryInterface.removeConstraint('MonobankTransactions', 'MonobankTransactions_monoAccountId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('MonobankTransactions', {
        fields: ['monoAccountId'],
        type: 'foreign key',
        name: 'MonobankTransactions_monoAccountId_fkey',
        references: {
          table: 'MonobankAccounts',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        transaction,
      });

      // 6. On system user deletion, delete all associated categories
      await queryInterface.removeConstraint('Categories', 'Categories_userId_fkey', {
        transaction,
      });
      await queryInterface.addConstraint('Categories', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'Categories_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        transaction,
      });

      // 7. On system user deletion, delete all associated accounts
      await queryInterface.removeConstraint('Accounts', 'Accounts_userId_fkey', { transaction });
      await queryInterface.addConstraint('Accounts', {
        fields: ['userId'],
        type: 'foreign key',
        name: 'Accounts_userId_fkey',
        references: {
          table: 'Users',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        transaction,
      });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
