import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Migration to add category-based budgeting support.
 *
 * Changes:
 * 1. Adds `type` column to Budgets table ('manual' or 'category')
 * 2. Creates BudgetCategories junction table for many-to-many relationship
 * 3. Removes deprecated `categoryName` column from Budgets table
 *
 * Existing budgets default to 'manual' type (backward compatible).
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Add type column to Budgets table
      await queryInterface.addColumn(
        'Budgets',
        'type',
        {
          type: DataTypes.ENUM('manual', 'category'),
          allowNull: false,
          defaultValue: 'manual',
        },
        { transaction: t },
      );

      // Add index on type column for filtering
      await queryInterface.addIndex('Budgets', ['type'], {
        name: 'budgets_type_idx',
        transaction: t,
      });

      // Create BudgetCategories junction table
      await queryInterface.createTable(
        'BudgetCategories',
        {
          budgetId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              model: 'Budgets',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          categoryId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              model: 'Categories',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        },
        { transaction: t },
      );

      // Composite primary key for the junction table
      await queryInterface.addConstraint('BudgetCategories', {
        fields: ['budgetId', 'categoryId'],
        type: 'primary key',
        name: 'budget_categories_pkey',
        transaction: t,
      });

      // Index for efficient lookup by budgetId
      await queryInterface.addIndex('BudgetCategories', ['budgetId'], {
        name: 'budget_categories_budget_id_idx',
        transaction: t,
      });

      // Index for efficient lookup by categoryId (reverse direction)
      await queryInterface.addIndex('BudgetCategories', ['categoryId'], {
        name: 'budget_categories_category_id_idx',
        transaction: t,
      });

      // Remove deprecated categoryName column
      await queryInterface.removeColumn('Budgets', 'categoryName', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Drop BudgetCategories table
      const budgetCategoriesExists = await queryInterface.tableExists('BudgetCategories');
      if (budgetCategoriesExists) {
        await queryInterface.removeConstraint('BudgetCategories', 'budget_categories_pkey', {
          transaction: t,
        });
        await queryInterface.dropTable('BudgetCategories', { transaction: t });
      }

      // Remove type column from Budgets
      await queryInterface.removeIndex('Budgets', 'budgets_type_idx', { transaction: t });
      await queryInterface.removeColumn('Budgets', 'type', { transaction: t });

      // Drop the ENUM type created by PostgreSQL
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Budgets_type";', {
        transaction: t,
      });

      // Re-add categoryName column (was removed in up migration)
      await queryInterface.addColumn(
        'Budgets',
        'categoryName',
        {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
