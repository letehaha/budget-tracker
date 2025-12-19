import { DataTypes, QueryInterface } from 'sequelize';

/**
 * Migration to add categorizationMeta JSONB field to Transactions table.
 * This field tracks how a transaction was categorized (manual, ai, mcc_rule, user_rule).
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // Add categorizationMeta column
    await queryInterface.addColumn('Transactions', 'categorizationMeta', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    });

    // Add GIN index for efficient filtering by categorization source
    await queryInterface.addIndex('Transactions', {
      fields: [queryInterface.sequelize.literal('("categorizationMeta"->>\'source\')')],
      name: 'transactions_categorization_source_idx',
      using: 'btree',
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    // Remove index first
    await queryInterface.removeIndex('Transactions', 'transactions_categorization_source_idx');

    // Remove column
    await queryInterface.removeColumn('Transactions', 'categorizationMeta');
  },
};
