import { DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

/**
 * Junction table for many-to-many relationship between Budgets and Categories.
 *
 * This table allows category-based budgets to track multiple categories, and
 * importantly, allows the SAME category to be tracked by MULTIPLE budgets.
 *
 * Example:
 * - Budget "Eating Out" → [Restaurants, Cafes, Bars]
 * - Budget "Entertainment" → [Bars, Movies, Games]
 * Both budgets can track "Bars" category independently.
 *
 * Why junction table instead of JSON array on Budget:
 * - Referential integrity: FK constraints ensure valid category IDs
 * - CASCADE delete: When category is deleted, entries auto-removed
 * - Efficient querying: Easy to find "all budgets tracking category X"
 */
@Table({ tableName: 'BudgetCategories', timestamps: false })
export default class BudgetCategories extends Model<
  InferAttributes<BudgetCategories>,
  InferCreationAttributes<BudgetCategories>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  declare budgetId: number;

  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  declare categoryId: number;
}
