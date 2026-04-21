import { DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

@Table({ tableName: 'TransactionGroupItems', timestamps: false })
export default class TransactionGroupItems extends Model<
  InferAttributes<TransactionGroupItems>,
  InferCreationAttributes<TransactionGroupItems>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  declare groupId: number;

  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  declare transactionId: number;
}
