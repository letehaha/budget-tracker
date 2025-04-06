'use strict';

const ENUM_NAME = 'enum_transfer_nature';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // await queryInterface.sequelize.query(`DROP TYPE "enum_transfer_nature"`, { transaction });
      await queryInterface.sequelize.query(
        `CREATE TYPE "${ENUM_NAME}" AS ENUM('not_transfer', 'transfer_between_user_accounts', 'transfer_out_wallet')`,
        { transaction },
      );

      // Add transferNature column with the ENUM type
      await queryInterface.addColumn(
        'Transactions',
        'transferNature',
        {
          type: ENUM_NAME,
          allowNull: false,
          defaultValue: 'not_transfer',
        },
        { transaction },
      );

      // Migrate data based on isTransfer value
      await queryInterface.sequelize.query(
        `
        UPDATE "Transactions"
        SET "transferNature" =
          CASE
            WHEN "isTransfer" = true
            THEN 'transfer_between_user_accounts'::"${ENUM_NAME}"
            ELSE 'not_transfer'::"${ENUM_NAME}"
          END
      `,
        { transaction },
      );

      // Remove the isTransfer column
      await queryInterface.removeColumn('Transactions', 'isTransfer', {
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Add back the isTransfer column
      await queryInterface.addColumn(
        'Transactions',
        'isTransfer',
        {
          type: Sequelize.DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
      );

      // Migrate data based on transferNature value
      await queryInterface.sequelize.query(
        `
        UPDATE "Transactions"
        SET "isTransfer" =
          CASE
            WHEN "transferNature" = 'transfer_between_user_accounts'
            THEN true
            ELSE false
          END
      `,
        { transaction },
      );

      // Remove the transferNature column
      await queryInterface.removeColumn('Transactions', 'transferNature', {
        transaction,
      });

      // Drop the ENUM type
      await queryInterface.sequelize.query(`DROP TYPE "${ENUM_NAME}"`, {
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
