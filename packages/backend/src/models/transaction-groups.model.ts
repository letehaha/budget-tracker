import Transactions from '@models/transactions.model';
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
  BelongsToMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

import TransactionGroupItems from './transaction-group-items.model';

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

  @BelongsToMany(() => Transactions, {
    through: () => TransactionGroupItems,
    foreignKey: 'groupId',
    otherKey: 'transactionId',
  })
  declare transactions?: NonAttribute<Transactions[]>;
}
