import { RecordId } from '@bt/shared/types';
import { DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

@Table({ tableName: 'TransactionTags', timestamps: false })
export default class TransactionTags extends Model<
  InferAttributes<TransactionTags>,
  InferCreationAttributes<TransactionTags>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare tagId: RecordId;

  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare transactionId: RecordId;
}
