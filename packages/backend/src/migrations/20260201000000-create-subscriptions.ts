import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Create Subscriptions table
      await queryInterface.createTable(
        'Subscriptions',
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
          type: {
            type: DataTypes.ENUM('subscription', 'bill'),
            allowNull: false,
            defaultValue: 'subscription',
          },
          expectedAmount: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Expected amount in cents',
          },
          expectedCurrencyCode: {
            type: DataTypes.STRING(3),
            allowNull: true,
          },
          frequency: {
            type: DataTypes.ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'annual'),
            allowNull: false,
          },
          startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
          },
          endDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
          },
          accountId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          categoryId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'Categories', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          matchingRules: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: { rules: [] },
          },
          isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          notes: {
            type: DataTypes.TEXT,
            allowNull: true,
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

      // 2. Create SubscriptionTransactions join table
      await queryInterface.createTable(
        'SubscriptionTransactions',
        {
          subscriptionId: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Subscriptions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          transactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            unique: true,
            references: { model: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          matchSource: {
            type: DataTypes.ENUM('manual', 'rule', 'ai'),
            allowNull: false,
          },
          matchedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
          status: {
            type: DataTypes.ENUM('active', 'unlinked'),
            allowNull: false,
            defaultValue: 'active',
          },
        },
        { transaction: t },
      );

      // 3. CHECK constraints
      // If amount is provided, currency must be provided (and vice versa)
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ADD CONSTRAINT "chk_subscriptions_amount_currency"
         CHECK (
           ("expectedAmount" IS NULL AND "expectedCurrencyCode" IS NULL) OR
           ("expectedAmount" IS NOT NULL AND "expectedCurrencyCode" IS NOT NULL)
         );`,
        { transaction: t },
      );

      // Subscriptions (type='subscription') require amount + currency
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ADD CONSTRAINT "chk_subscriptions_type_requires_amount"
         CHECK (
           "type" != 'subscription' OR
           ("expectedAmount" IS NOT NULL AND "expectedCurrencyCode" IS NOT NULL)
         );`,
        { transaction: t },
      );

      // 4. Indexes
      await queryInterface.addIndex('Subscriptions', ['userId', 'isActive'], {
        name: 'subscriptions_user_id_is_active_idx',
        transaction: t,
      });

      await queryInterface.addIndex('SubscriptionTransactions', ['transactionId'], {
        name: 'subscription_transactions_transaction_id_idx',
        unique: true,
        transaction: t,
      });

      await queryInterface.addIndex('SubscriptionTransactions', ['subscriptionId'], {
        name: 'subscription_transactions_subscription_id_idx',
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
      await queryInterface.dropTable('SubscriptionTransactions', { transaction: t });
      await queryInterface.dropTable('Subscriptions', { transaction: t });

      // Drop ENUM types so re-running `up` works cleanly
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_SubscriptionTransactions_matchSource";', {
        transaction: t,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_SubscriptionTransactions_status";', {
        transaction: t,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Subscriptions_type";', { transaction: t });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Subscriptions_frequency";', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
