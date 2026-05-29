import { BUDGET_STATUSES, BUDGET_TYPES, RecordId } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { moneyGetCents, moneySetCents } from '@common/types/money-column';
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
  BeforeCreate,
  BelongsTo,
  BelongsToMany,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import BudgetCategories from './budget-categories.model';
import BudgetTransactions from './budget-transactions.model';

@Table({
  timestamps: false,
  tableName: 'Budgets',
})
export default class Budgets extends Model<InferAttributes<Budgets>, InferCreationAttributes<Budgets>> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare id: CreationOptional<RecordId>;

  @BeforeCreate
  static assignId(instance: Budgets) {
    if (!instance.id) instance.id = uuidv7() as RecordId;
  }

  @Attribute(DataTypes.STRING(200))
  @NotNull
  declare name: string;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare status: BUDGET_STATUSES;

  @Attribute(DataTypes.STRING)
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

  @Attribute(DataTypes.BIGINT)
  get limitAmount(): Money {
    return moneyGetCents(this, 'limitAmount');
  }
  set limitAmount(val: Money | number | null) {
    moneySetCents(this, 'limitAmount', val);
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsToMany(() => Transactions, {
    through: () => BudgetTransactions,
    foreignKey: 'budgetId',
    otherKey: 'transactionId',
  })
  declare transactions?: NonAttribute<Transactions[]>;

  @BelongsToMany(() => Categories, {
    through: () => BudgetCategories,
    foreignKey: 'budgetId',
    otherKey: 'categoryId',
  })
  declare categories?: NonAttribute<Categories[]>;
}
