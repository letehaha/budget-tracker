import { BUDGET_STATUSES } from '@bt/shared/types';
import Transactions from '@models/Transactions.model';
import Users from '@models/Users.model';
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

  @Attribute(DataTypes.STRING)
  declare categoryName: string | null;

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
}
