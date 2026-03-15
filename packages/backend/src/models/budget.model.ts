import { BUDGET_STATUSES, BUDGET_TYPES } from '@bt/shared/types';
import Categories from '@models/categories.model';
import Transactions from '@models/transactions.model';
import Users from '@models/users.model';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import {
  Attribute,
  AutoIncrement,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

import BudgetCategories from './budget-categories.model';
import BudgetTransactions from './budget-transactions.model';

@Table({
  timestamps: false,
  tableName: 'Budgets',
})
export default class Budgets extends Model<InferAttributes<Budgets>, InferCreationAttributes<Budgets>> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.STRING(200))
  @NotNull
  declare name: string;

  @Attribute(DataTypes.ENUM({ values: Object.values(BUDGET_STATUSES) }))
  @NotNull
  declare status: BUDGET_STATUSES;

  @Attribute(DataTypes.ENUM({ values: Object.values(BUDGET_TYPES) }))
  @NotNull
  @Default(BUDGET_TYPES.manual)
  declare type: CreationOptional<BUDGET_TYPES>;

  @Attribute(DataTypes.DATE)
  declare startDate: Date | null;

  @Attribute(DataTypes.DATE)
  declare endDate: Date | null;

  @Attribute(DataTypes.BOOLEAN)
  @Default(false)
  declare autoInclude: CreationOptional<boolean>;

  @Attribute(DataTypes.INTEGER)
  declare limitAmount: number | null;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  // In Sequelize v7, BelongsToMany is defined on Transactions model and automatically creates the inverse
  declare transactions?: NonAttribute<Transactions[]>;

  declare categories?: NonAttribute<Categories[]>;
}
