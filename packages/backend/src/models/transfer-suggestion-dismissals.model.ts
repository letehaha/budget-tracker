import { RecordId } from '@bt/shared/types';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import { Attribute, BelongsTo, Default, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

import Transactions from './transactions.model';
import Users from './users.model';

@Table({
  tableName: 'TransferSuggestionDismissals',
  freezeTableName: true,
  timestamps: false,
  // userId is the leading column of the composite PK, so a separate index is redundant
})
export default class TransferSuggestionDismissals extends Model<
  InferAttributes<TransferSuggestionDismissals>,
  InferCreationAttributes<TransferSuggestionDismissals>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  declare userId: number;

  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare expenseTransactionId: RecordId;

  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare incomeTransactionId: RecordId;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare createdAt: CreationOptional<Date>;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsTo(() => Transactions, 'expenseTransactionId')
  declare expenseTransaction?: NonAttribute<Transactions>;

  @BelongsTo(() => Transactions, 'incomeTransactionId')
  declare incomeTransaction?: NonAttribute<Transactions>;
}

export async function createDismissal({
  userId,
  expenseTransactionId,
  incomeTransactionId,
}: {
  userId: number;
  expenseTransactionId: string;
  incomeTransactionId: string;
}) {
  return TransferSuggestionDismissals.findOrCreate({
    where: { userId, expenseTransactionId, incomeTransactionId },
  });
}

export async function getDismissalsForUser({
  userId,
  expenseTransactionIds,
}: {
  userId: number;
  expenseTransactionIds?: string[];
}) {
  return TransferSuggestionDismissals.findAll({
    where: {
      userId,
      ...(expenseTransactionIds && { expenseTransactionId: expenseTransactionIds }),
    },
    attributes: ['expenseTransactionId', 'incomeTransactionId'],
    raw: true,
  });
}
