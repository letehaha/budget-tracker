module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Define the ENUM type for account types
      const ACCOUNT_TYPES = [
        'general',
        'cash',
        'current-account',
        'credit-card',
        'saving',
        'bonus',
        'insurance',
        'investment',
        'loan',
        'mortgage',
        'overdraft',
        'crypto',
      ];

      // Add a temporary ENUM column
      await queryInterface.addColumn(
        'Accounts',
        'accountCategory',
        {
          type: Sequelize.ENUM(...ACCOUNT_TYPES),
          allowNull: false,
          defaultValue: 'general',
        },
        { transaction },
      );

      // Map numeric IDs to ENUM values
      for (let i = 0; i < ACCOUNT_TYPES.length; i++) {
        await queryInterface.sequelize.query(
          `UPDATE "Accounts" SET "accountCategory" = '${ACCOUNT_TYPES[i]}' WHERE "accountTypeId" = ${i + 1}`,
          { transaction },
        );
      }

      // Remove the old accountTypeId column
      await queryInterface.removeColumn('Accounts', 'accountTypeId', {
        transaction,
      });

      // Drop the AccountTypes table
      await queryInterface.dropTable('AccountTypes', { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Strict data for recovering, do not edit until you sure
      const ACCOUNT_TYPES = {
        general: 'General',
        cash: 'Cash',
        'current-account': 'Current account',
        'credit-card': 'Credit card',
        saving: 'Saving account',
        bonus: 'Bonus',
        insurance: 'Insurance',
        investment: 'Investment',
        loan: 'Loan',
        mortgage: 'Mortgage',
        overdraft: 'Account with overdraft',
        crypto: 'Crypto',
      };

      // Recreate the AccountTypes table
      await queryInterface.createTable(
        'AccountTypes',
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
        'AccountTypes',
        Object.values(ACCOUNT_TYPES).map((name, index) => ({
          id: index + 1,
          name,
        })),
        { transaction },
      );

      // Firstly create column with allowNull: true
      // then fill it
      // then set allowNull: fakse
      await queryInterface.addColumn(
        'Accounts',
        'accountTypeId',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'AccountTypes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );

      // Map ENUM values back to numeric IDs
      for (let i = 0; i < Object.values(ACCOUNT_TYPES).length; i++) {
        await queryInterface.sequelize.query(
          `UPDATE "Accounts" SET "accountTypeId" = ${i + 1} WHERE "accountCategory" = '${Object.keys(ACCOUNT_TYPES)[i]}'`,
          { transaction },
        );
      }

      await queryInterface.changeColumn(
        'Accounts',
        'accountTypeId',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'AccountTypes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );

      // Remove the ENUM accountTypeId column
      await queryInterface.removeColumn('Accounts', 'accountCategory', {
        transaction,
      });

      // Drop the ENUM type
      await queryInterface.sequelize.query('DROP TYPE "enum_Accounts_accountCategory"', {
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
