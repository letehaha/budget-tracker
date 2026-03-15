import Budgets from '@models/budget.model';
import { DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

import Transactions from './transactions.model';

@Table({ tableName: 'BudgetTransactions', timestamps: false })
export default class BudgetTransactions extends Model<
  InferAttributes<BudgetTransactions>,
  InferCreationAttributes<BudgetTransactions>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  @Index
  declare budgetId: number;

  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  @Index
  declare transactionId: number;
}
