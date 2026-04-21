import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import { Attribute, AutoIncrement, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

import type Transactions from './transactions.model';

@Table({
  tableName: 'TransactionGroups',
  timestamps: true,
})
export default class TransactionGroups extends Model<
  InferAttributes<TransactionGroups>,
  InferCreationAttributes<TransactionGroups>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.STRING(100))
  @NotNull
  declare name: string;

  @Attribute(DataTypes.STRING(500))
  declare note: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Inverse of Transactions.@BelongsToMany(TransactionGroups) — auto-created by Sequelize v7
  declare transactions?: NonAttribute<Transactions[]>;
}
