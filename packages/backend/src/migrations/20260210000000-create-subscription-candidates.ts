import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'SubscriptionCandidates',
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
          suggestedName: {
            type: DataTypes.STRING(200),
            allowNull: false,
          },
          detectedFrequency: {
            type: DataTypes.ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'annual'),
            allowNull: false,
          },
          averageAmount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Average amount in cents',
          },
          currencyCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
          },
          accountId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          sampleTransactionIds: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            allowNull: false,
            defaultValue: [],
          },
          occurrenceCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          confidenceScore: {
            type: DataTypes.FLOAT,
            allowNull: false,
          },
          medianIntervalDays: {
            type: DataTypes.FLOAT,
            allowNull: false,
          },
          status: {
            type: DataTypes.ENUM('pending', 'accepted', 'dismissed'),
            allowNull: false,
            defaultValue: 'pending',
          },
          subscriptionId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Subscriptions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          detectedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
          lastOccurrenceAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          resolvedAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      // Indexes
      await queryInterface.addIndex('SubscriptionCandidates', ['userId', 'status'], {
        name: 'subscription_candidates_user_id_status_idx',
        transaction: t,
      });

      await queryInterface.addIndex(
        'SubscriptionCandidates',
        ['userId', 'suggestedName', 'accountId', 'currencyCode'],
        {
          name: 'subscription_candidates_dedup_idx',
          transaction: t,
        },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.dropTable('SubscriptionCandidates', { transaction: t });

      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_SubscriptionCandidates_detectedFrequency";', {
        transaction: t,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_SubscriptionCandidates_status";', {
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
