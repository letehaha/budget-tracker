import { DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

@Table({ tableName: 'TransactionTags', timestamps: false })
export default class TransactionTags extends Model<
  InferAttributes<TransactionTags>,
  InferCreationAttributes<TransactionTags>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  declare tagId: number;

  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  declare transactionId: number;
}
