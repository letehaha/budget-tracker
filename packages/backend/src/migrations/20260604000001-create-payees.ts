import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Create Payees table
      await queryInterface.createTable(
        'Payees',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          name: {
            type: DataTypes.STRING(200),
            allowNull: false,
          },
          normalizedName: {
            type: DataTypes.STRING(200),
            allowNull: false,
          },
          defaultCategoryId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Categories', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          // VARCHAR + TS-side enum (project convention: no DB enums). Holds
          // the CATEGORIZATION_MODE value. NOT NULL with explicit default so
          // existing rows on a future re-run get the safe-default behavior.
          categorizationMode: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: 'enforce',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      // 2. Create PayeeAliases table
      await queryInterface.createTable(
        'PayeeAliases',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          payeeId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Payees', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          rawName: {
            type: DataTypes.STRING(500),
            allowNull: false,
          },
          normalizedName: {
            type: DataTypes.STRING(500),
            allowNull: false,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      // 3. Indexes on Payees
      await queryInterface.addIndex('Payees', ['userId', 'normalizedName'], {
        name: 'payees_user_id_normalized_name_uniq',
        unique: true,
        transaction: t,
      });

      await queryInterface.addIndex('Payees', ['userId', 'defaultCategoryId'], {
        name: 'payees_user_id_default_category_id_idx',
        transaction: t,
      });

      // 4. Indexes on PayeeAliases
      await queryInterface.addIndex('PayeeAliases', ['payeeId', 'normalizedName'], {
        name: 'payee_aliases_payee_id_normalized_name_uniq',
        unique: true,
        transaction: t,
      });

      await queryInterface.addIndex('PayeeAliases', ['payeeId'], {
        name: 'payee_aliases_payee_id_idx',
        transaction: t,
      });

      // 4b. PayeeIgnoredNames — per-user blocklist of normalized merchant
      // strings that should never be auto-promoted into a Payee (Step 3
      // promotion in the extraction service consults this set). Users
      // populate it by deleting noise like "Переказ на картку" with the
      // "Delete & ignore" affordance.
      await queryInterface.createTable(
        'PayeeIgnoredNames',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          normalizedName: {
            type: DataTypes.STRING(500),
            allowNull: false,
          },
          rawSample: {
            type: DataTypes.STRING(500),
            allowNull: true,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('PayeeIgnoredNames', ['userId', 'normalizedName'], {
        name: 'payee_ignored_names_user_id_normalized_name_uniq',
        unique: true,
        transaction: t,
      });

      // 5. Add columns to Transactions
      await queryInterface.addColumn(
        'Transactions',
        'payeeId',
        {
          type: DataTypes.UUID,
          allowNull: true,
          references: { model: 'Payees', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction: t },
      );

      await queryInterface.addColumn(
        'Transactions',
        'payeeLocked',
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction: t },
      );

      // 6. Transaction indexes for Payee lookups + stats aggregation
      await queryInterface.sequelize.query(
        `CREATE INDEX "transactions_user_id_payee_id_time_idx"
           ON "Transactions" ("userId", "payeeId", "time" DESC);`,
        { transaction: t },
      );

      await queryInterface.addIndex('Transactions', ['payeeId'], {
        name: 'transactions_payee_id_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeIndex('Transactions', 'transactions_payee_id_idx', { transaction: t });
      await queryInterface.removeIndex('Transactions', 'transactions_user_id_payee_id_time_idx', { transaction: t });
      await queryInterface.removeColumn('Transactions', 'payeeLocked', { transaction: t });
      await queryInterface.removeColumn('Transactions', 'payeeId', { transaction: t });

      await queryInterface.dropTable('PayeeIgnoredNames', { transaction: t });
      await queryInterface.dropTable('PayeeAliases', { transaction: t });
      await queryInterface.dropTable('Payees', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
