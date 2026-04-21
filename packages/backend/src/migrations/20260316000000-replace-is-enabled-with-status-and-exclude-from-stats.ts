import { DataTypes, AbstractQueryInterface, Transaction } from '@sequelize/core';

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1. Create the ENUM type for account status
      await queryInterface.sequelize.query(`CREATE TYPE "enum_Accounts_status" AS ENUM ('active', 'archived')`, {
        transaction: t,
      });

      // 2. Add 'status' column with default 'active'
      await queryInterface.addColumn(
        'Accounts',
        'status',
        {
          type: DataTypes.ENUM('active', 'archived'),
          allowNull: false,
          defaultValue: 'active',
        },
        { transaction: t },
      );

      // 3. Add 'excludeFromStats' column with default false
      await queryInterface.addColumn(
        'Accounts',
        'excludeFromStats',
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction: t },
      );

      // 4. Migrate existing data: isEnabled=false → status='archived' + excludeFromStats=true
      await queryInterface.sequelize.query(
        `UPDATE "Accounts" SET "status" = 'archived', "excludeFromStats" = true WHERE "isEnabled" = false`,
        { transaction: t },
      );

      // 5. Remove the old isEnabled column
      await queryInterface.removeColumn('Accounts', 'isEnabled', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1. Re-add isEnabled column
      await queryInterface.addColumn(
        'Accounts',
        'isEnabled',
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        { transaction: t },
      );

      // 2. Migrate data back: archived → isEnabled=false
      await queryInterface.sequelize.query(`UPDATE "Accounts" SET "isEnabled" = false WHERE "status" = 'archived'`, {
        transaction: t,
      });

      // 3. Remove new columns
      await queryInterface.removeColumn('Accounts', 'status', { transaction: t });
      await queryInterface.removeColumn('Accounts', 'excludeFromStats', { transaction: t });

      // 4. Drop the ENUM type
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Accounts_status"', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
