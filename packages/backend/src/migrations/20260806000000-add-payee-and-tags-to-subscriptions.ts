import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // SET NULL on delete: deleting the payee must not delete the subscription.
      await queryInterface.addColumn(
        'Subscriptions',
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

      await queryInterface.addIndex('Subscriptions', ['payeeId'], {
        name: 'subscriptions_payee_id_idx',
        transaction: t,
      });

      // CASCADE on both FKs: deleting a tag drops it from every subscription,
      // deleting a subscription drops its rows.
      await queryInterface.createTable(
        'SubscriptionTags',
        {
          subscriptionId: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Subscriptions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          tagId: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Tags', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        },
        { transaction: t },
      );

      // Composite PK already covers subscriptionId-first lookups; tagId index
      // covers the FK cascade path on tag deletion.
      await queryInterface.addIndex('SubscriptionTags', ['tagId'], {
        name: 'subscription_tags_tag_id_idx',
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
      await queryInterface.dropTable('SubscriptionTags', { transaction: t });
      await queryInterface.removeIndex('Subscriptions', 'subscriptions_payee_id_idx', { transaction: t });
      await queryInterface.removeColumn('Subscriptions', 'payeeId', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
