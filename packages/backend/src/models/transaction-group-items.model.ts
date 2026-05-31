import type { InferAttributes, InferCreationAttributes } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import { Attribute, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

@Table({ tableName: 'TransactionGroupItems', timestamps: false })
export default class TransactionGroupItems extends Model<
  InferAttributes<TransactionGroupItems>,
  InferCreationAttributes<TransactionGroupItems>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare groupId: string;

  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare transactionId: string;
}
